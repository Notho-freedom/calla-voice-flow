import { useEffect } from 'react';
import { FileExplorer } from '@/components/explorer';

export default function ExplorerStandalone() {
  useEffect(() => {
    document.title = 'Cognitive Stream — Explorer';
  }, []);

  return (
    <FileExplorer
      embeddedMode="standalone"
      showWindowChrome
      className="h-screen"
    />
  );
}
