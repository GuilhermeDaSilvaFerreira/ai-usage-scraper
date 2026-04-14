export enum JobType {
  SEED = 'seed',
  COLLECT = 'collect',
  COLLECT_PEOPLE = 'collect_people',
  COLLECT_SIGNALS = 'collect_signals',
  EXTRACT = 'extract',
  SCORE = 'score',
}

export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
