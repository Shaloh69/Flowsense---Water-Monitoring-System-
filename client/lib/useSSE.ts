import { useEffect, useRef } from "react";
import { useSensorStore, SensorReading } from "@/lib/store/sensor-store";
import { toast } from "@/lib/toast";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";

export function useSSE() {
  const { setLatest, setConnected } = useSensorStore();
  const esRef = useRef<EventSource | null>(null);
  const wasOnlineRef = useRef(false);

  useEffect(() => {
    function connect() {
      const es = new EventSource(`${SERVER_URL}/api/stream`);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const data: SensorReading = JSON.parse(e.data);
          setLatest(data);

          if (!wasOnlineRef.current) {
            wasOnlineRef.current = true;
            setConnected(true);
            toast.success("Connected", "Receiving live data from Flowsense.");
          }
        } catch {
          // ignore malformed frames
        }
      };

      es.onerror = () => {
        if (wasOnlineRef.current) {
          wasOnlineRef.current = false;
          setConnected(false);
          toast.error("Connection lost", "Trying to reconnect to Flowsense server...");
        }
        es.close();
        // exponential back-off capped at 10 s
        setTimeout(connect, Math.min(10_000, 2_000));
      };
    }

    connect();

    return () => {
      esRef.current?.close();
    };
  }, [setLatest, setConnected]);
}
