import { AppShell } from "./components/layout/AppShell";
import { useLiveEvents } from "./hooks/useLiveEvents";

function App() {
  useLiveEvents();

  return <AppShell />;
}

export default App;
