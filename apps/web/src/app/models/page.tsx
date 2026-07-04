'use client';
import { ModelLibrary } from '@/components/ModelLibrary';
import { ModelBenchmark } from '@/components/ModelBenchmark';
import { LatencyHeatmap } from '@/components/LatencyHeatmap';
import { RoutingExperiments } from '@/components/RoutingExperiments';

export default function ModelsPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <RoutingExperiments />
      <LatencyHeatmap />
      <ModelBenchmark />
      <ModelLibrary />
    </div>
  );
}
