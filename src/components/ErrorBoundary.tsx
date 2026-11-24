import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#14110F] text-[#F2E9D8] flex items-center justify-center p-6">
          <div className="max-w-md w-full p-6 rounded-xl bg-[#1D1815] border border-[#3B3028] space-y-4">
            <h1 className="font-editorial text-lg text-[#F5ECD9]">
              Aviso de sincronización
            </h1>
            <p className="text-xs text-[#BFB09E] font-mono break-words">
              {this.state.errorMessage || 'Ocurrió un problema inesperado.'}
            </p>
            <button
              type="button"
              onClick={() =>
                this.setState({ hasError: false, errorMessage: null })
              }
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#D99B4E] text-[#171310] hover:bg-[#E6A95C] transition-colors cursor-pointer"
            >
              Continuar escribiendo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
