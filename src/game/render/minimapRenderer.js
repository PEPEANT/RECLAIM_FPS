function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function drawMinimap({
  ctx,
  canvas,
  arena,
  alphaBase,
  bravoBase,
  controlPoint,
  activeMatchMode,
  onlineCtf,
  remotePlayers,
  enemies,
  playerPosition,
  yaw,
  supportBase,
  myTeam,
  minimapPadding,
  playerRadius,
  baseSupportRadius
}) {
  if (!ctx || !canvas) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  const centerX = Number.isFinite(arena?.mid?.x)
    ? arena.mid.x
    : (Number(alphaBase?.x) + Number(bravoBase?.x)) * 0.5 || 0;
  const centerZ = Number.isFinite(arena?.mid?.z)
    ? arena.mid.z
    : (Number(alphaBase?.z) + Number(bravoBase?.z)) * 0.5 || 0;
  const halfExtent = Math.max(
    40,
    Number(arena?.halfExtent) || 0,
    Math.abs((alphaBase?.x ?? 0) - centerX) + 12,
    Math.abs((bravoBase?.x ?? 0) - centerX) + 12,
    Math.abs((alphaBase?.z ?? 0) - centerZ) + 12,
    Math.abs((bravoBase?.z ?? 0) - centerZ) + 12
  );
  const drawSize = Math.min(width, height) - minimapPadding * 2;
  const halfDraw = drawSize * 0.5;
  const scale = halfDraw / halfExtent;

  const toMapPoint = (x, z) => ({
    x: width * 0.5 + clamp((Number(x) - centerX) * scale, -halfDraw, halfDraw),
    y: height * 0.5 + clamp((Number(z) - centerZ) * scale, -halfDraw, halfDraw)
  });

  const drawMarker = (x, z, color, size = 4, shape = "circle") => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return;
    }
    const point = toMapPoint(x, z);
    ctx.save();
    ctx.fillStyle = color;
    if (shape === "square") {
      ctx.fillRect(point.x - size, point.y - size, size * 2, size * 2);
    } else if (shape === "diamond") {
      ctx.translate(point.x, point.y);
      ctx.rotate(Math.PI * 0.25);
      ctx.fillRect(-size, -size, size * 2, size * 2);
    } else {
      ctx.beginPath();
      ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  const frameLeft = width * 0.5 - halfDraw;
  const frameTop = height * 0.5 - halfDraw;
  const frameSize = halfDraw * 2;
  ctx.fillStyle = "rgba(7, 18, 30, 0.78)";
  ctx.fillRect(frameLeft - 6, frameTop - 6, frameSize + 12, frameSize + 12);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(176, 222, 245, 0.42)";
  ctx.strokeRect(frameLeft - 5, frameTop - 5, frameSize + 10, frameSize + 10);
  ctx.beginPath();
  ctx.rect(frameLeft, frameTop, frameSize, frameSize);
  ctx.clip();

  ctx.fillStyle = "rgba(11, 27, 38, 0.92)";
  ctx.fillRect(frameLeft, frameTop, frameSize, frameSize);

  ctx.strokeStyle = "rgba(157, 205, 235, 0.12)";
  ctx.lineWidth = 1;
  for (let step = -2; step <= 2; step += 1) {
    const offset = step * halfDraw * 0.5;
    ctx.beginPath();
    ctx.moveTo(frameLeft, height * 0.5 + offset);
    ctx.lineTo(frameLeft + frameSize, height * 0.5 + offset);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width * 0.5 + offset, frameTop);
    ctx.lineTo(width * 0.5 + offset, frameTop + frameSize);
    ctx.stroke();
  }

  if (supportBase && Number.isFinite(supportBase.x) && Number.isFinite(supportBase.z)) {
    const point = toMapPoint(supportBase.x, supportBase.z);
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(8, baseSupportRadius * scale), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(157, 238, 194, 0.14)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(157, 238, 194, 0.48)";
    ctx.stroke();
  }

  drawMarker(alphaBase?.x, alphaBase?.z, "#6fc8ff", 5, "square");
  drawMarker(bravoBase?.x, bravoBase?.z, "#ff8f83", 5, "square");

  if (activeMatchMode === "online") {
    drawMarker(onlineCtf?.flags?.alpha?.at?.x, onlineCtf?.flags?.alpha?.at?.z, "#8ed9ff", 4, "diamond");
    drawMarker(onlineCtf?.flags?.bravo?.at?.x, onlineCtf?.flags?.bravo?.at?.z, "#ffb0a3", 4, "diamond");
  } else {
    drawMarker(controlPoint?.x, controlPoint?.z, "#9fffcf", 4, "diamond");
  }

  if (activeMatchMode === "online") {
    for (const remote of remotePlayers ?? []) {
      if (!remote?.hasValidState || !remote?.group?.visible) {
        continue;
      }
      const color =
        remote.team && myTeam && remote.team === myTeam
          ? "#8de7ff"
          : remote.team
            ? "#ff9c91"
            : "#d6f0ff";
      drawMarker(remote.group.position.x, remote.group.position.z, color, 3.4, "circle");
    }
  } else {
    for (const enemy of enemies ?? []) {
      const markerX = enemy?.hitbox?.position?.x ?? enemy?.model?.position?.x;
      const markerZ = enemy?.hitbox?.position?.z ?? enemy?.model?.position?.z;
      drawMarker(markerX, markerZ, "#ffd27c", 3.2, "circle");
    }
  }

  const playerPoint = toMapPoint(playerPosition.x, playerPosition.z);
  const dirX = -Math.sin(yaw);
  const dirZ = -Math.cos(yaw);
  ctx.beginPath();
  ctx.arc(playerPoint.x, playerPoint.y, playerRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#f5fbff";
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(playerPoint.x, playerPoint.y);
  ctx.lineTo(playerPoint.x + dirX * 14, playerPoint.y + dirZ * 14);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.stroke();

  ctx.restore();
}
