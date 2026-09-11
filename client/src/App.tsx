import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useParams } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import LobbyView from "./components/LobbyView";
import GameRoomView from "./components/GameRoomView";

function RoomRoute() {
  const params = useParams<{ code: string }>();
  return <GameRoomView roomCodeOrToken={params.code || ""} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LobbyView} />
      <Route path="/room/:code" component={RoomRoute} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster position="top-center" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
