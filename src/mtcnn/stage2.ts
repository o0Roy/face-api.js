import { BoundingBox } from './BoundingBox';
import { extractImagePatches } from './extractImagePatches';
import { nms } from './nms';
import { RNet } from './RNet';
import { RNetParams } from './types';

export async function stage2(
  img: HTMLCanvasElement,
  inputBoxes: BoundingBox[],
  scoreThreshold: number,
  params: RNetParams,
  stats: any
) {

  let ts = Date.now()
  const rnetInputs = await extractImagePatches(img, inputBoxes, { width: 24, height: 24 })
  stats.stage2_extractImagePatches = Date.now() - ts

  ts = Date.now()
  const rnetOuts = rnetInputs.map(
    rnetInput => {
      const out = RNet(rnetInput, params)
      rnetInput.dispose()
      return out
    }
  )
  stats.stage2_rnet = Date.now() - ts

  const scoreDatas = await Promise.all(rnetOuts.map(out => out.scores.data()))
  const scores = scoreDatas.map(arr => Array.from(arr)).reduce((all, arr) => all.concat(arr))
  const indices = scores
    .map((score, idx) => ({ score, idx }))
    .filter(c => c.score > scoreThreshold)
    .map(({ idx }) => idx)

  const filteredBoxes = indices.map(idx => inputBoxes[idx])
  const filteredScores = indices.map(idx => scores[idx])

  let finalBoxes: BoundingBox[] = []
  let finalScores: number[] = []

  if (filteredBoxes.length > 0) {
    ts = Date.now()
    const indicesNms = nms(
      filteredBoxes,
      filteredScores,
      0.7
    )
    stats.stage2_nms = Date.now() - ts

    const regions = indicesNms.map(idx =>
      new BoundingBox(
        rnetOuts[indices[idx]].regions.get(0, 0),
        rnetOuts[indices[idx]].regions.get(0, 1),
        rnetOuts[indices[idx]].regions.get(0, 2),
        rnetOuts[indices[idx]].regions.get(0, 3)
      )
    )

    finalScores = indicesNms.map(idx => filteredScores[idx])
    finalBoxes = indicesNms.map((idx, i) => filteredBoxes[idx].calibrate(regions[i]))
  }

  rnetOuts.forEach(t => {
    t.regions.dispose()
    t.scores.dispose()
  })

  return {
    boxes: finalBoxes,
    scores: finalScores
  }
}