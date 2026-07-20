import { Component, type ReactNode } from 'react';
import { useImageLoader } from '../../hooks/useImageLoader';

interface Props {
  cachedEditStateRef: React.RefObject<any>;
}

class ImageLoaderErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('ImageLoaderManager error:', error, info);
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

function ImageLoaderInner({ cachedEditStateRef }: Props) {
  useImageLoader(cachedEditStateRef);
  return null;
}

export default function ImageLoaderManager({ cachedEditStateRef }: Props) {
  return (
    <ImageLoaderErrorBoundary>
      <ImageLoaderInner cachedEditStateRef={cachedEditStateRef} />
    </ImageLoaderErrorBoundary>
  );
}
