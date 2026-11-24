import worker from '../worker.mjs';

export const config = {
  runtime: 'edge'
};

export default function handler(request) {
  return worker.fetch(request, process.env);
}
