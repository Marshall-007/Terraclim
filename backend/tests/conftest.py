import os

# Force deterministic synthetic weather so the test suite never touches the network.
os.environ["VINO_FORCE_FIXTURE"] = "1"
os.environ.setdefault("DEMO_DATE", "2026-01-20")
