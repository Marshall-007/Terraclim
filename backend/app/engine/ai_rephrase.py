from __future__ import annotations

import logging
import re

import httpx

from ..config import get_settings

# Optional AI polish over the deterministic insight. The model receives ONLY the
# assembled facts and template prose and may rephrase them — it never computes,
# and any reply that introduces numbers absent from the source is discarded.
# Plain httpx against an OpenAI-compatible endpoint (AI_BASE_URL) so any provider
# works without an SDK dependency. Every failure path returns the template.

log = logging.getLogger("vino.insight.ai")

TIMEOUT_S = 6.0
MAX_TOKENS = 320

SYSTEM_PROMPT = (
    "You polish vineyard irrigation explanations for a grower. Rephrase the given "
    "explanation into 2-4 natural, plain-English sentences. Hard rules: use ONLY the "
    "facts provided; never introduce a number, date, unit or claim that is not in the "
    "material; keep every number exactly as written; no jargon without translation; "
    "no markdown, no lists — return only the rephrased prose."
)

_NUM_RE = re.compile(r"\d+(?:[.,]\d+)?")


def maybe_rephrase(insight: dict) -> dict:
    """Return the insight with an AI-rephrased explanation when a key is set and
    the call succeeds cleanly; otherwise the template insight, unchanged."""
    settings = get_settings()
    if not settings.ai_key:
        return insight
    try:
        text = _call_model(insight, settings)
        if text and _no_new_numbers(text, insight):
            return {**insight, "explanation": text, "source": "ai"}
        if text:
            log.warning("AI rephrase introduced numbers not in the facts; using template")
    except Exception as exc:  # AI is narration only; never let it fail the endpoint
        log.warning("AI rephrase failed (%s); using template", exc)
    return insight


def _prompt(insight: dict) -> str:
    facts = "\n".join(f"- {f['label']}: {f['value']}" for f in insight["facts"])
    caveats = "\n".join(f"- {c}" for c in insight["caveats"]) or "- none"
    return (
        f"Headline: {insight['headline']}\n\n"
        f"Facts:\n{facts}\n\n"
        f"Caveats (context only, do not repeat verbatim):\n{caveats}\n\n"
        f"Template explanation to rephrase:\n{insight['explanation']}"
    )


def _call_model(insight: dict, settings) -> str:
    resp = httpx.post(
        f"{settings.ai_base_url}/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.ai_key}"},
        json={
            "model": settings.ai_model,
            "max_tokens": MAX_TOKENS,
            "temperature": 0.3,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _prompt(insight)},
            ],
        },
        timeout=TIMEOUT_S,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def _no_new_numbers(text: str, insight: dict) -> bool:
    """Every numeric token in the AI reply must already appear in the assembled
    material (rounded forms of source decimals are tolerated)."""
    source = " ".join(
        [insight["headline"], insight["explanation"]]
        + [f"{f['label']} {f['value']}" for f in insight["facts"]]
        + list(insight["caveats"])
    )
    allowed = set()
    for tok in _NUM_RE.findall(source):
        clean = tok.replace(",", "")
        allowed.add(clean)
        try:
            allowed.add(str(round(float(clean))))
        except ValueError:
            pass
    return all(tok.replace(",", "") in allowed for tok in _NUM_RE.findall(text))
