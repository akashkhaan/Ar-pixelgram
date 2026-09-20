import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export const useGoBack = (fallbackPath: string = '/home') => {
  const navigate = useNavigate();

  const goBack = useCallback(() => {
    // Check if there is valid history in the current session
    const hasHistory =
      typeof window !== 'undefined' &&
      window.history.length > 1 &&
      (window.history.state == null ||
        window.history.state.idx == null ||
        window.history.state.idx > 0);

    if (hasHistory) {
      navigate(-1);
    } else {
      navigate(fallbackPath);
    }
  }, [navigate, fallbackPath]);

  return goBack;
};

export default useGoBack;
