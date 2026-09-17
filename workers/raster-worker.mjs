import { prepareRasterJob, renderRasterTile } from '../src/compute/raster_jobs.mjs';

// At most two panel jobs are current. A cache keeps their dynamical contexts
// alive between tiles without retaining frames, output buffers, or old jobs.
const preparedJobs = new Map();

self.addEventListener('message', ({ data: message }) => {
  if (!message || message.type !== 'tile') return;
  const { jobId, tileId } = message;
  try {
    let prepared = preparedJobs.get(jobId);
    if (!prepared) {
      prepared = prepareRasterJob(message.job);
      preparedJobs.set(jobId, prepared);
      if (preparedJobs.size > 2) preparedJobs.delete(preparedJobs.keys().next().value);
    }
    const tile = renderRasterTile(prepared, message.tile);
    self.postMessage({ type: 'tile', jobId, tileId, ...tile }, [tile.data.buffer]);
  } catch (error) {
    self.postMessage({
      type: 'error', jobId, tileId,
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});
