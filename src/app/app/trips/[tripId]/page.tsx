import { Suspense } from "react";
import { TripDetailClient } from "./trip-detail-client";

export const instant = false;

type Params = {
  params: Promise<{ tripId: string }>;
};

export default async function TripDetailPage({ params }: Params) {
  const { tripId } = await params;

  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 md:px-10">
          <p className="text-muted">Loading trip details...</p>
        </div>
      }
    >
      <TripDetailClient tripId={tripId} />
    </Suspense>
  );
}
