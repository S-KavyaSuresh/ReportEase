import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ReportEase Error]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          maxWidth: 480, margin: '80px auto', padding: '32px 24px', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            {this.state.error.message || 'An unexpected error occurred.'}
          </div>
          <button
            className="btn-primary"
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
