// The title screen navigates to /play without retaining its query string.
// Remember an explicit perspective request for this page load only.
const initialRequest = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('perspective') === '1';

export function isProjectionDiagnosticRequested(): boolean {
  const current = new URLSearchParams(window.location.search).get('perspective');
  return current === null ? initialRequest : current === '1';
}
