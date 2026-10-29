/* Local image optimisation. Originals are never retained in an optimised record.
 * Sequential callers keep decode memory bounded. JSON references/IDs are unchanged.
 */
const ImageOptimizer = (() => {
  const VERSION = 1;
  function bytes(data) {
    const text = data.slice(data.indexOf(",") + 1);
    return (
      Math.floor((text.length * 3) / 4) -
      (text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0)
    );
  }
  function dimensions(width, height, role) {
    const scale =
      role === "cover"
        ? Math.min(1, 600 / height, 960 / width)
        : Math.min(1, 1600 / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }
  function animated(data) {
    if (data.startsWith("data:image/gif;")) return true; // Preserve GIF frames, even when static.
    if (!/^data:image\/(png|webp);/.test(data)) return false;
    const binary = atob(data.slice(data.indexOf(",") + 1));
    const u32 = (p, little) =>
      little
        ? binary.charCodeAt(p) +
          binary.charCodeAt(p + 1) * 256 +
          binary.charCodeAt(p + 2) * 65536 +
          binary.charCodeAt(p + 3) * 16777216
        : binary.charCodeAt(p) * 16777216 +
          binary.charCodeAt(p + 1) * 65536 +
          binary.charCodeAt(p + 2) * 256 +
          binary.charCodeAt(p + 3);
    if (data.startsWith("data:image/png;")) {
      for (let p = 8; p + 12 <= binary.length; ) {
        const type = binary.slice(p + 4, p + 8);
        if (type === "acTL") return true;
        if (type === "IDAT") return false;
        const size = u32(p, false);
        p += 12 + size;
      }
    } else {
      for (let p = 12; p + 8 <= binary.length; ) {
        const type = binary.slice(p, p + 4),
          size = u32(p + 4, true);
        if (
          type === "ANIM" ||
          type === "ANMF" ||
          (type === "VP8X" && binary.charCodeAt(p + 8) & 2)
        )
          return true;
        p += 8 + size + (size % 2);
      }
    }
    return false;
  }
  async function optimize(image) {
    const original = image.data,
      before = bytes(original);
    const unchanged = (reason) => ({
      image,
      before,
      after: before,
      changed: false,
      reason,
    });
    const keepAnimation = animated(original);
    const prior = image.optimization;
    if (prior?.version === VERSION && prior.bytes === before) {
      const target = dimensions(prior.width, prior.height, image.role);
      if (target.width === prior.width && target.height === prior.height)
        return unchanged("optimized");
    }
    const img = new Image();
    let canvas;
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () =>
          reject(
            Error(
              typeof I18n === "undefined"
                ? "Image illisible."
                : I18n.t("Image illisible."),
            ),
          );
        img.src = original;
      });
      const w = img.naturalWidth || img.width,
        h = img.naturalHeight || img.height;
      if (!w || !h)
        throw Error(
          typeof I18n === "undefined"
            ? "Image illisible."
            : I18n.t("Image illisible."),
        );
      if (keepAnimation) return unchanged("animation");
      const target = dimensions(w, h, image.role);
      canvas = document.createElement("canvas");
      canvas.width = target.width;
      canvas.height = target.height;
      const ctx = canvas.getContext("2d");
      if (!ctx)
        throw Error(
          typeof I18n === "undefined"
            ? "Optimisation indisponible."
            : I18n.t("Optimisation indisponible."),
        );
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, target.width, target.height);
      // PNG is a lossless candidate, useful for line art and flat colours.
      // WebP preserves transparency; unsupported encoders return PNG.
      const png = canvas.toDataURL("image/png");
      let candidate = png;
      const webp = canvas.toDataURL(
        "image/webp",
        image.role === "cover" ? 0.86 : 0.92,
      );
      if (bytes(webp) < bytes(candidate)) candidate = webp;
      if (original.startsWith("data:image/jpeg;")) {
        const jpeg = canvas.toDataURL(
          "image/jpeg",
          image.role === "cover" ? 0.86 : 0.92,
        );
        if (bytes(jpeg) < bytes(candidate)) candidate = jpeg;
      }
      if (candidate === "data:," || bytes(candidate) >= before)
        return unchanged("smaller-original");
      const mime = candidate.slice(5, candidate.indexOf(";")),
        ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
      const after = bytes(candidate);
      const optimized = {
        ...image,
        name: (image.name || "image").replace(/\.[^.]+$/, "") + "." + ext,
        data: candidate,
        optimization: {
          version: VERSION,
          sourceBytes: prior?.sourceBytes || before,
          bytes: after,
          width: target.width,
          height: target.height,
        },
      };
      // Metadata must not outweigh the saving, especially for tiny images.
      if (JSON.stringify(optimized).length >= JSON.stringify(image).length)
        return unchanged("smaller-json");
      return {
        before,
        after,
        changed: true,
        reason: "optimized",
        image: optimized,
      };
    } finally {
      img.onload = img.onerror = null;
      img.src = "";
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
    }
  }
  return { bytes, dimensions, optimize };
})();
if (typeof module !== "undefined" && module.exports)
  module.exports = ImageOptimizer;
