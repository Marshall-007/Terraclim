import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './screens/Dashboard';
import { FieldMode } from './screens/FieldMode';
import { BattlePlan } from './screens/BattlePlan';
import { SeasonBank } from './screens/SeasonBank';
import { PourSlips } from './screens/PourSlips';
import { Scenario } from './screens/Scenario';
import { Backtest } from './screens/Backtest';

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="field" element={<FieldMode />} />
          <Route path="battle-plan" element={<BattlePlan />} />
          <Route path="water-bank" element={<SeasonBank />} />
          <Route path="slips" element={<PourSlips />} />
          <Route path="scenario" element={<Scenario />} />
          <Route path="backtest" element={<Backtest />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
