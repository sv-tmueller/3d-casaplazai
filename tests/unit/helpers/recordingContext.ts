/**
 * Recording 2D-context stub for render specs (copied from the pattern in
 * render.dedupe.spec, which retains its own local stub; kept separate to
 * avoid touching that spec's assertions — see review of #68).
 */
export class RecordingCtx {
  strokeStyle = '';
  fillStyle = '';
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  globalAlpha = 1;
  font = '';
  textAlign = 'left';
  textBaseline = 'alphabetic';
  strokes: Array<{
    style: string;
    lineWidth: number;
    from: [number, number];
    to: [number, number];
  }> = [];
  private cur: [number, number] = [0, 0];
  private from: [number, number] = [0, 0];
  clearRect(): void {}
  fillRect(): void {}
  beginPath(): void {}
  closePath(): void {}
  save(): void {}
  restore(): void {}
  setLineDash(): void {}
  fill(): void {}
  fillText(): void {}
  rect(): void {}
  arc(): void {}
  moveTo(x: number, y: number): void {
    this.cur = [x, y];
    this.from = [x, y];
  }
  lineTo(x: number, y: number): void {
    this.cur = [x, y];
  }
  stroke(): void {
    this.strokes.push({
      style: String(this.strokeStyle),
      lineWidth: this.lineWidth,
      from: [...this.from] as [number, number],
      to: [...this.cur] as [number, number],
    });
  }
}
