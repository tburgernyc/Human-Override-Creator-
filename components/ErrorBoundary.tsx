
import React from 'react';

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Application Error:', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-eclipse-black flex items-center justify-center p-8">
                    <div className="max-w-lg w-full text-center space-y-8">
                        <div className="w-24 h-24 rounded-full bg-solar-amber/10 flex items-center justify-center mx-auto border border-solar-amber/30">
                            <i className="fa-solid fa-triangle-exclamation text-4xl text-solar-amber"></i>
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-white uppercase tracking-tight font-mono mb-3">
                                Signal Interrupted
                            </h1>
                            <p className="text-sm text-mystic-gray leading-relaxed">
                                A critical fault was detected in the production pipeline. Your project data is safe in local storage.
                            </p>
                        </div>
                        <div className="nm-inset-input p-4 rounded-xl text-left">
                            <p className="text-[10px] font-bold text-solar-amber uppercase tracking-widest mb-2">Error Details</p>
                            <p className="text-xs text-celestial-stone font-mono break-all">
                                {this.state.error?.message || 'Unknown error'}
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                this.setState({ hasError: false, error: null });
                                window.location.reload();
                            }}
                            className="px-10 py-4 bg-gold-gradient text-white rounded-xl text-[10px] font-black uppercase tracking-[0.3em] shadow-xl hover:scale-105 transition-all"
                        >
                            Restart Production Suite
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
