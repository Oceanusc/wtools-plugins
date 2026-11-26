(() => {
  "use strict";

  window.ColorAssistantMedia = function ({ $, element, button, notice, copyText, swatch, savePalette, saveFavorite }) {
    const C = window.ColorMath;
    const imagePanel = $("image-palette");
    const drop = $("image-drop");
    const preview = $("image-preview");
    const previewContext = preview.getContext("2d");
    const imageInput = $("image-file");
    const sample = document.createElement("canvas");
    const context = sample.getContext("2d", { willReadFrequently: true });
    let image = null;
    let imageUrl = "";
    let imageName = "";
    let loadAttempt = 0;
    let imageColors = [];
    let pixel = null;
    let gradient;
    const interpolation = CSS.supports("background", "linear-gradient(0deg in srgb, #000, #fff)") ? " in srgb" : "";

    async function loadImage(source, name) {
      const attempt = ++loadAttempt;
      const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : "";
      const url = objectUrl || source;
      const next = new Image();
      next.src = url;
      $("image-status").textContent = "正在读取图片…";
      try {
        await next.decode();
        if (!next.naturalWidth || !next.naturalHeight) throw new Error();
        if (attempt !== loadAttempt) return;
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        image = next;
        imageName = name;
        imageUrl = objectUrl;
        pixel = null;
        const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
        preview.width = Math.max(1, Math.round(image.naturalWidth * scale));
        preview.height = Math.max(1, Math.round(image.naturalHeight * scale));
        previewContext.drawImage(image, 0, 0, preview.width, preview.height);
        preview.hidden = false;
        $("image-empty").hidden = true;
        $("image-results").hidden = false;
        extractColors();
      } catch {
        if (attempt === loadAttempt) $("image-status").textContent = "无法读取图片，请选择可预览的图片文件。";
      } finally {
        if (objectUrl && imageUrl !== objectUrl) URL.revokeObjectURL(objectUrl);
      }
    }

    function imageFile(file) {
      if (!file) return;
      if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif|svg|ico|avif)$/i.test(file.name)) {
        loadImage(file, file.name);
      } else {
        notice("请选择图片文件");
      }
    }

    function extractColors() {
      if (!image) return;
      const { naturalWidth: width, naturalHeight: height } = image;
      const scale = Math.min(1, 160 / Math.max(width, height));
      sample.width = Math.max(1, Math.round(width * scale));
      sample.height = Math.max(1, Math.round(height * scale));
      context.drawImage(image, 0, 0, sample.width, sample.height);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      imageColors = C.extractDominantColors(pixels, Number($("image-count").value));
      $("image-status").textContent = imageName + " · " + width + " × " + height + " px";
      renderImageColors();
    }

    function renderImageColors() {
      $("save-image-palette").disabled = !imageColors.length;
      const items = imageColors.map(({ hex, ratio }) => {
        const card = element("div", "image-color");
        card.append(swatch({ hex }), element("span", "muted", "样本占比 " + ratio + "%"));
        return card;
      });
      if (image && !items.length) items.push(element("p", "muted", "图片中没有可提取的非透明颜色"));
      $("image-colors").replaceChildren(...items);
      $("pixel-heading").hidden = !pixel;
      $("pixel-color").replaceChildren(...(pixel ? [swatch(pixel)] : []));
    }

    preview.addEventListener("click", event => {
      if (!image) return;
      const bounds = preview.getBoundingClientRect();
      const x = Math.max(0, Math.min(image.naturalWidth - 1,
        Math.floor((event.clientX - bounds.left) / bounds.width * image.naturalWidth)));
      const y = Math.max(0, Math.min(image.naturalHeight - 1,
        Math.floor((event.clientY - bounds.top) / bounds.height * image.naturalHeight)));
      sample.width = 1;
      sample.height = 1;
      context.drawImage(image, x, y, 1, 1, 0, 0, 1, 1);
      const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
      if (!alpha) {
        notice("当前像素为透明色");
        return;
      }
      pixel = { hex: C.rgbToHex(r, g, b), name: "像素 " + x + ", " + y };
      renderImageColors();
    });

    $("pick-image").addEventListener("click", () => imageInput.click());
    imageInput.addEventListener("change", () => {
      imageFile(imageInput.files[0]);
      imageInput.value = "";
    });
    imagePanel.addEventListener("dragover", event => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      drop.classList.add("dragging");
    });
    imagePanel.addEventListener("dragleave", event => {
      if (!imagePanel.contains(event.relatedTarget)) drop.classList.remove("dragging");
    });
    imagePanel.addEventListener("drop", event => {
      event.preventDefault();
      drop.classList.remove("dragging");
      imageFile(event.dataTransfer.files[0]);
    });
    document.addEventListener("paste", event => {
      if (imagePanel.hidden || document.querySelector("dialog[open]")) return;
      const item = [...(event.clipboardData?.items || [])].find(value => value.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      event.preventDefault();
      loadImage(file, "剪贴板图片");
    });
    $("paste-image").addEventListener("click", async () => {
      const attempt = loadAttempt;
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const type = item.types.find(value => value.startsWith("image/"));
          if (type) {
            const blob = await item.getType(type);
            if (attempt === loadAttempt) loadImage(blob, "剪贴板图片");
            return;
          }
        }
        if (attempt === loadAttempt) notice("剪贴板中没有图片");
      } catch {
        if (attempt === loadAttempt) notice("无法读取剪贴板，请按 Ctrl+V 粘贴");
      }
    });
    $("image-count").addEventListener("change", extractColors);
    $("save-image-palette").addEventListener("click", () => {
      savePalette(imageName, imageColors.map(({ hex }) => ({ hex })));
    });

    function gradientCss({ angle, stops }) {
      return "linear-gradient(" + angle + "deg" + interpolation + ", " + stops.join(", ") + ")";
    }

    function gradientCard(item, label = item.name) {
      const card = button("", "gradient-card", () => openGradient(item));
      const color = element("span", "gradient-card-paint");
      color.style.background = gradientCss(item);
      card.append(color, element("span", "gradient-card-label", label));
      return card;
    }

    function openGradient(item) {
      gradient = { name: item.name, angle: item.angle, stops: [...item.stops] };
      $("gradient-title").textContent = item.name;
      $("gradient-angle").value = item.angle;
      renderGradientStops();
      renderGradient();
      $("gradient-dialog").showModal();
    }

    function renderGradient() {
      const css = gradientCss(gradient);
      $("gradient-preview").style.background = css;
      $("gradient-css").value = css;
      $("gradient-angle-value").value = gradient.angle + "°";
    }

    function renderGradientStops() {
      const stops = $("gradient-stops");
      stops.replaceChildren();
      gradient.stops.forEach((hex, index) => {
        const group = element("div", "gradient-stop");
        const input = element("input");
        input.type = "color";
        input.value = hex;
        input.setAttribute("aria-label", "渐变色 " + (index + 1));
        input.addEventListener("input", () => {
          gradient.stops[index] = input.value;
          renderGradient();
        });
        group.append(input);
        if (gradient.stops.length > 2) {
          const remove = button("×", "remove-stop", () => {
            gradient.stops.splice(index, 1);
            renderGradientStops();
            renderGradient();
            stops.querySelectorAll('input')[Math.min(index, gradient.stops.length - 1)].focus();
          });
          remove.setAttribute("aria-label", "移除渐变色 " + (index + 1));
          group.append(remove);
        }
        stops.append(group);
      });
      if (gradient.stops.length < 6) {
        stops.append(button("＋ 添加色标", "", () => {
          gradient.stops.push(gradient.stops.at(-1));
          renderGradientStops();
          renderGradient();
          stops.querySelector('div:last-of-type input').focus();
        }));
      }
    }

    $("gradient-angle").addEventListener("input", event => {
      gradient.angle = Number(event.target.value);
      renderGradient();
    });
    $("copy-gradient-css").addEventListener("click", () => copyText(gradientCss(gradient), "已复制 CSS"));
    $("save-gradient").addEventListener("click", () => {
      saveFavorite({ type: "gradient", gradient: { ...gradient, stops: [...gradient.stops] } });
    });

    function exportDimensions() {
      const width = $("gradient-width");
      const height = $("gradient-height");
      if (!width.reportValidity() || !height.reportValidity()) return null;
      return { width: width.valueAsNumber, height: height.valueAsNumber };
    }

    async function gradientPng({ width, height }) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      const radians = gradient.angle * Math.PI / 180;
      const x = Math.sin(radians);
      const y = -Math.cos(radians);
      // CSS measures the gradient along the projection of the entire box.
      const half = (Math.abs(width * x) + Math.abs(height * y)) / 2;
      const fill = ctx.createLinearGradient(width / 2 - x * half, height / 2 - y * half,
        width / 2 + x * half, height / 2 + y * half);
      gradient.stops.forEach((hex, index) => fill.addColorStop(index / (gradient.stops.length - 1), hex));
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, width, height);
      return new Promise((resolve, reject) => canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("无法生成 PNG"));
      }, "image/png"));
    }

    $("download-gradient").addEventListener("click", async () => {
      const size = exportDimensions();
      if (!size) return;
      try {
        const blob = await gradientPng(size);
        const url = URL.createObjectURL(blob);
        const link = element("a");
        link.download = "gradient-" + size.width + "x" + size.height + ".png";
        link.href = url;
        $("gradient-dialog").append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      } catch {
        notice("无法生成 PNG");
      }
    });

    $("copy-gradient-image").addEventListener("click", async () => {
      const size = exportDimensions();
      if (!size) return;
      try {
        if (!navigator.clipboard?.write || typeof ClipboardItem !== "function") throw new Error();
        const png = gradientPng(size);
        await Promise.all([
          navigator.clipboard.write([new ClipboardItem({ "image/png": png })]),
          png
        ]);
        notice("已复制渐变图片");
      } catch {
        notice("无法复制图片，可使用「下载 PNG」");
      }
    });

    return { loadImage, renderImageColors, gradientCard, openGradient };
  };
})();
