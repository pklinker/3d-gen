import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Catches a render-time crash in its subtree and shows the message + stack
 *  instead of silently unmounting to a blank pane (React's default with no
 *  boundary). Scoped around the Maps editor specifically since it's the
 *  newest, least-battle-tested surface in the app. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#e06b5a", fontFamily: "ui-monospace, monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
          <h2 style={{ color: "#e06b5a" }}>Something crashed</h2>
          <div>{this.state.error.message}</div>
          <div style={{ marginTop: 12, opacity: 0.8 }}>{this.state.error.stack}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
