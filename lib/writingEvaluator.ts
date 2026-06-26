// ================================================================
// Learn with Velmorth — Japanese Writing Practice System Evaluator
// ================================================================

export interface Point {
  x: number;
  y: number;
}

export interface StrokeEvaluation {
  isCorrectOrder: boolean;
  isCorrectDirection: boolean;
  accuracyScore: number; // 0 - 100
  suggestions: string[];
}

export interface CharacterEvaluation {
  overallScore: number;
  accuracyScore: number;
  strokeOrderScore: number;
  shapeScore: number;
  proportionScore: number;
  suggestions: string[];
}

/**
 * Resample a stroke (array of points) to have exactly N equidistant points.
 */
export function resampleStroke(points: Point[], numPoints = 30): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    const single = points[0];
    return Array(numPoints).fill(null).map(() => ({ ...single }));
  }

  // Calculate total path length
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }

  const interval = totalLength / (numPoints - 1);
  const resampled: Point[] = [{ ...points[0] }];
  let accumDistance = 0;

  for (let i = 1; i < points.length && resampled.length < numPoints; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (accumDistance + dist >= interval) {
      // Interpolate along this segment
      const remaining = interval - accumDistance;
      const ratio = remaining / dist;
      const interpolatedX = p1.x + ratio * dx;
      const interpolatedY = p1.y + ratio * dy;
      const newPt = { x: interpolatedX, y: interpolatedY };
      
      resampled.push(newPt);
      points.splice(i, 0, newPt); // Insert interpolated point
      accumDistance = 0;
    } else {
      accumDistance += dist;
    }
  }

  // Pad or truncate to ensure exactly numPoints
  while (resampled.length < numPoints) {
    resampled.push({ ...points[points.length - 1] });
  }
  if (resampled.length > numPoints) {
    resampled.splice(numPoints);
  }

  return resampled;
}

/**
 * Centroid and scale normalization for a set of points.
 */
export function normalizePoints(points: Point[], size = 100): Point[] {
  if (points.length === 0) return [];

  // Find bounding box
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  points.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  const width = maxX - minX || 1;
  const height = maxY - minY || 1;

  // Center points (shift centroid to 0,0)
  let sumX = 0;
  let sumY = 0;
  points.forEach((p) => {
    sumX += p.x;
    sumY += p.y;
  });
  const centroidX = sumX / points.length;
  const centroidY = sumY / points.length;

  const translated = points.map((p) => ({
    x: p.x - centroidX,
    y: p.y - centroidY,
  }));

  // Scale points to fit a bounding box of size x size
  const scale = size / Math.max(width, height);
  const normalized = translated.map((p) => ({
    x: p.x * scale,
    y: p.y * scale,
  }));

  return normalized;
}

/**
 * Generate points from an SVG path description (client-side only).
 */
export function samplePointsFromSvgPath(pathD: string, numPoints = 30): Point[] {
  if (typeof document === 'undefined') {
    // Return empty fallback array on server-side Next.js pre-rendering
    return Array(numPoints).fill(null).map(() => ({ x: 0, y: 0 }));
  }

  try {
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', pathD);
    const length = pathEl.getTotalLength();
    const points: Point[] = [];

    for (let i = 0; i < numPoints; i++) {
      const distance = (i / (numPoints - 1)) * length;
      const p = pathEl.getPointAtLength(distance);
      points.push({ x: p.x, y: p.y });
    }
    return points;
  } catch (err) {
    console.error('Error sampling points from SVG path:', err);
    return Array(numPoints).fill(null).map(() => ({ x: 0, y: 0 }));
  }
}

/**
 * Evaluate a single user stroke against a reference SVG path.
 */
export function evaluateStroke(
  userPoints: Point[],
  referencePathD: string,
  strokeIndex: number,
  expectedIndex: number
): StrokeEvaluation {
  const suggestions: string[] = [];
  const numPoints = 30;

  // 1. Verify Stroke Order
  const isCorrectOrder = strokeIndex === expectedIndex;
  if (!isCorrectOrder) {
    suggestions.push(`Wrong stroke order. You drew stroke ${strokeIndex + 1} instead of ${expectedIndex + 1}.`);
  }

  // 2. Resample and Normalize Points
  const refPoints = samplePointsFromSvgPath(referencePathD, numPoints);
  const resampledUser = resampleStroke(userPoints, numPoints);

  const normRef = normalizePoints(refPoints);
  const normUser = normalizePoints(resampledUser);

  // 3. Verify Direction
  // Distance forward vs backward
  let distForward = 0;
  let distBackward = 0;

  for (let i = 0; i < numPoints; i++) {
    const pRef = normRef[i];
    const pUser = normUser[i];
    const pUserRev = normUser[numPoints - 1 - i];

    distForward += Math.sqrt(Math.pow(pRef.x - pUser.x, 2) + Math.pow(pRef.y - pUser.y, 2));
    distBackward += Math.sqrt(Math.pow(pRef.x - pUserRev.x, 2) + Math.pow(pRef.y - pUserRev.y, 2));
  }

  const avgDistForward = distForward / numPoints;
  const avgDistBackward = distBackward / numPoints;

  const isCorrectDirection = avgDistForward <= avgDistBackward;
  if (!isCorrectDirection) {
    suggestions.push('Stroke drawn in reverse. Try drawing from start to end.');
  }

  // 4. Calculate Accuracy Score based on minimum distance
  const baseDistance = isCorrectDirection ? avgDistForward : avgDistBackward;
  
  // Normalized distance scale: 0 distance = 100 score, 30 distance = 0 score
  const accuracyScore = Math.max(0, Math.min(100, Math.round(100 - baseDistance * 2.2)));

  return {
    isCorrectOrder,
    isCorrectDirection,
    accuracyScore,
    suggestions,
  };
}

/**
 * Evaluate the overall drawing (all strokes combined).
 */
export function evaluateCharacter(
  userStrokes: Point[][],
  referencePathsD: string[]
): CharacterEvaluation {
  const numPoints = 30;
  const suggestions: string[] = [];

  if (userStrokes.length !== referencePathsD.length) {
    const strokeDiff = userStrokes.length - referencePathsD.length;
    if (strokeDiff > 0) {
      suggestions.push(`Too many strokes! You drew ${userStrokes.length} strokes instead of ${referencePathsD.length}.`);
    } else {
      suggestions.push(`Incomplete! You only drew ${userStrokes.length} strokes instead of ${referencePathsD.length}.`);
    }
  }

  // 1. Calculate Stroke Order Score
  // Deduct points for order errors
  const orderScore = Math.max(0, 100 - Math.abs(userStrokes.length - referencePathsD.length) * 20);

  // 2. Sample and Normalize all strokes together for Proportion & Alignment check
  const allRefPoints: Point[] = [];
  const allUserPoints: Point[] = [];

  const minStrokes = Math.min(userStrokes.length, referencePathsD.length);
  
  for (let s = 0; s < minStrokes; s++) {
    const refSt = samplePointsFromSvgPath(referencePathsD[s], numPoints);
    const userSt = resampleStroke(userStrokes[s], numPoints);
    allRefPoints.push(...refSt);
    allUserPoints.push(...userSt);
  }

  // Normalise all strokes globally (preserve relative proportions and offsets)
  const globalNormRef = normalizePoints(allRefPoints);
  const globalNormUser = normalizePoints(allUserPoints);

  // Measure global offset/proportion discrepancy
  let globalDistance = 0;
  for (let i = 0; i < globalNormRef.length; i++) {
    const dx = globalNormRef[i].x - globalNormUser[i].x;
    const dy = globalNormRef[i].y - globalNormUser[i].y;
    globalDistance += Math.sqrt(dx * dx + dy * dy);
  }

  const avgGlobalDistance = globalNormRef.length > 0 ? globalDistance / globalNormRef.length : 50;
  const proportionScore = Math.max(0, Math.min(100, Math.round(100 - avgGlobalDistance * 2.5)));

  // 3. Measure Local Shape Score (normalized per-stroke)
  let shapeSum = 0;
  let accSum = 0;

  for (let s = 0; s < minStrokes; s++) {
    const refSt = samplePointsFromSvgPath(referencePathsD[s], numPoints);
    const userSt = resampleStroke(userStrokes[s], numPoints);

    const normRef = normalizePoints(refSt);
    const normUser = normalizePoints(userSt);

    // Compute shape matching distance
    let shapeDistance = 0;
    for (let i = 0; i < numPoints; i++) {
      // Find forward matching distance
      const dx = normRef[i].x - normUser[i].x;
      const dy = normRef[i].y - normUser[i].y;
      shapeDistance += Math.sqrt(dx * dx + dy * dy);
    }
    const avgShapeDist = shapeDistance / numPoints;
    const strokeShapeScore = Math.max(0, Math.min(100, Math.round(100 - avgShapeDist * 2.0)));
    shapeSum += strokeShapeScore;

    // Direct match (accuracy)
    const directEval = evaluateStroke(userStrokes[s], referencePathsD[s], s, s);
    accSum += directEval.accuracyScore;

    if (directEval.suggestions.length > 0) {
      suggestions.push(`Stroke ${s + 1}: ${directEval.suggestions[0]}`);
    }
  }

  const shapeScore = minStrokes > 0 ? Math.round(shapeSum / minStrokes) : 0;
  const accuracyScore = minStrokes > 0 ? Math.round(accSum / minStrokes) : 0;

  // Deduct proportion scores if stroke count is off
  const adjustedProportion = Math.max(0, proportionScore - Math.abs(userStrokes.length - referencePathsD.length) * 15);

  // Overall Score is a weighted average
  const overallScore = Math.round(
    accuracyScore * 0.4 +
    orderScore * 0.2 +
    shapeScore * 0.2 +
    adjustedProportion * 0.2
  );

  if (overallScore >= 90) {
    suggestions.push('Sublime! Your brush strokes are precise and beautifully formed.');
  } else if (overallScore >= 75) {
    suggestions.push('Good work! Pay attention to stroke alignments and corners.');
  } else {
    suggestions.push('Keep practicing. Focus on drawing slowly and following the guided animations.');
  }

  return {
    overallScore,
    accuracyScore,
    strokeOrderScore: orderScore,
    shapeScore,
    proportionScore: adjustedProportion,
    suggestions: Array.from(new Set(suggestions)), // unique suggestions
  };
}
