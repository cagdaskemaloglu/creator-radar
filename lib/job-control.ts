export class WorkerInterrupted extends Error {
  constructor() { super('Worker stopped; persistent checkpoint saved'); }
}
