import { Component, type ReactNode } from 'react';
import { useImageProcessing } from '../../hooks/useImageProcessing';

interface Props {
  transformWrapperRef: React.RefObject<any>;
  prevAdjustmentsRef: React.RefObject<any>;
  previewJobIdRef: React.RefObject<number>;
  latestRenderedJobIdRef: React.RefObject<number>;
  currentResRef: React.RefObject<number>;
}

class ImageProcessingErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('ImageProcessingManager error:', error, info);
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

function ImageProcessingInner(props: Props) {
  useImageProcessing(props.transformWrapperRef, props.prevAdjustmentsRef, {
    previewJobIdRef: props.previewJobIdRef,
    latestRenderedJobIdRef: props.latestRenderedJobIdRef,
    currentResRef: props.currentResRef,
  });

  return null;
}

export default function ImageProcessingManager(props: Props) {
  return (
    <ImageProcessingErrorBoundary>
      <ImageProcessingInner {...props} />
    </ImageProcessingErrorBoundary>
  );
}
