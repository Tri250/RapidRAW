import { useEffect, useRef } from 'react';
import { useImageProcessing } from '../../hooks/useImageProcessing';
import { useEditorStore } from '../../store/useEditorStore';

interface Props {
  transformWrapperRef: React.RefObject<any>;
  prevAdjustmentsRef: React.RefObject<any>;
  previewJobIdRef: React.RefObject<number>;
  latestRenderedJobIdRef: React.RefObject<number>;
  currentResRef: React.RefObject<number>;
}

export default function ImageProcessingManager(props: Props) {
  const { performDeepSelfTest } = useImageProcessing(props.transformWrapperRef, props.prevAdjustmentsRef, {
    previewJobIdRef: props.previewJobIdRef,
    latestRenderedJobIdRef: props.latestRenderedJobIdRef,
    currentResRef: props.currentResRef,
  });

  const selfTestRequest = useEditorStore((state) => state.imageProcessingSelfTestRequest);
  const setEditor = useEditorStore((state) => state.setEditor);
  const lastProcessedRef = useRef(0);

  useEffect(() => {
    if (selfTestRequest === 0 || selfTestRequest === lastProcessedRef.current) return;
    lastProcessedRef.current = selfTestRequest;
    let cancelled = false;
    performDeepSelfTest()
      .then((result) => {
        if (!cancelled) {
          setEditor({ imageProcessingSelfTestResult: result });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setEditor({
            imageProcessingSelfTestResult: {
              success: false,
              details: {
                self_test_framework: { ok: false, message: `Self-test failed: ${err?.message || String(err)}` },
              },
            },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selfTestRequest, performDeepSelfTest, setEditor]);

  return null;
}
