(function () {
    function mergeLineSegments(segments, vertical) {
        const sorted = segments.slice().sort((a, b) => {
            const coordinateDifference = (vertical ? a.x : a.y) - (vertical ? b.x : b.y);
            return coordinateDifference || (vertical ? a.y0 - b.y0 : a.x0 - b.x0);
        });
        const lines = [];

        sorted.forEach(segment => {
            const coordinate = vertical ? segment.x : segment.y;
            const start = vertical ? segment.y0 : segment.x0;
            const end = vertical ? segment.y1 : segment.x1;
            const line = lines.find(candidate => Math.abs(candidate.coordinate - coordinate) <= 2 && start <= candidate.end + 4 && end >= candidate.start - 4);
            if (line) {
                line.coordinate = (line.coordinate + coordinate) / 2;
                line.start = Math.min(line.start, start);
                line.end = Math.max(line.end, end);
            } else {
                lines.push({ coordinate, start, end });
            }
        });

        return lines.map(line => vertical
            ? { x: line.coordinate, y0: line.start, y1: line.end }
            : { y: line.coordinate, x0: line.start, x1: line.end });
    }

    function findGridTables(operatorList) {
        const horizontalSegments = [];
        const verticalSegments = [];

        for (let index = 0; index < operatorList.fnArray.length; index++) {
            if (operatorList.fnArray[index] !== pdfjsLib.OPS.constructPath) continue;
            const bounds = operatorList.argsArray[index][2];
            if (!bounds || bounds.length < 4) continue;
            const width = Math.abs(bounds[1] - bounds[0]);
            const height = Math.abs(bounds[3] - bounds[2]);
            if (width > 50 && height <= 2) {
                horizontalSegments.push({ x0: bounds[0], x1: bounds[1], y: (bounds[2] + bounds[3]) / 2 });
            } else if (height > 15 && width <= 2) {
                verticalSegments.push({ x: (bounds[0] + bounds[1]) / 2, y0: bounds[2], y1: bounds[3] });
            }
        }

        const horizontal = mergeLineSegments(horizontalSegments, false);
        const vertical = mergeLineSegments(verticalSegments, true);
        const lines = [...horizontal.map(line => ({ ...line, type: 'h' })), ...vertical.map(line => ({ ...line, type: 'v' }))];
        const parents = lines.map((_, index) => index);
        const find = index => parents[index] === index ? index : (parents[index] = find(parents[index]));
        const join = (a, b) => { parents[find(a)] = find(b); };

        horizontal.forEach((hLine, hIndex) => {
            vertical.forEach((vLine, vIndex) => {
                const crosses = vLine.x >= hLine.x0 - 3 && vLine.x <= hLine.x1 + 3 && hLine.y >= vLine.y0 - 3 && hLine.y <= vLine.y1 + 3;
                if (crosses) join(hIndex, horizontal.length + vIndex);
            });
        });

        const groups = new Map();
        lines.forEach((line, index) => {
            const root = find(index);
            if (!groups.has(root)) groups.set(root, { horizontal: [], vertical: [] });
            groups.get(root)[line.type === 'h' ? 'horizontal' : 'vertical'].push(line);
        });

        return [...groups.values()].map(group => {
            const xs = [...new Set(group.vertical.map(line => Math.round(line.x)))].sort((a, b) => a - b);
            const ys = [...new Set(group.horizontal.map(line => Math.round(line.y)))].sort((a, b) => a - b);
            if (xs.length < 2 || ys.length < 2) return null;
            const region = { x0: xs[0], x1: xs[xs.length - 1], y0: ys[0], y1: ys[ys.length - 1], xs, ys };
            if (region.x1 - region.x0 < 80 || region.y1 - region.y0 < 25) return null;
            return region;
        }).filter(Boolean);
    }

    function findVectorRegions(operatorList, page, tableRegions) {
        const [viewX0, viewY0, viewX1, viewY1] = page.view;
        const pageArea = (viewX1 - viewX0) * (viewY1 - viewY0);
        const boxes = [];

        for (let index = 0; index < operatorList.fnArray.length; index++) {
            if (operatorList.fnArray[index] !== pdfjsLib.OPS.constructPath) continue;
            const bounds = operatorList.argsArray[index][2];
            if (!bounds || bounds.length < 4) continue;
            const x0 = Math.max(viewX0, bounds[0]);
            const x1 = Math.min(viewX1, bounds[1]);
            const y0 = Math.max(viewY0, bounds[2]);
            const y1 = Math.min(viewY1, bounds[3]);
            if (x1 - x0 < 1 || y1 - y0 < 1) continue;
            boxes.push({ x0, x1, y0, y1 });
        }

        const parents = boxes.map((_, index) => index);
        const find = index => parents[index] === index ? index : (parents[index] = find(parents[index]));
        const join = (a, b) => { parents[find(a)] = find(b); };
        for (let a = 0; a < boxes.length; a++) {
            for (let b = a + 1; b < boxes.length; b++) {
                const gapX = Math.max(0, boxes[a].x0 - boxes[b].x1, boxes[b].x0 - boxes[a].x1);
                const gapY = Math.max(0, boxes[a].y0 - boxes[b].y1, boxes[b].y0 - boxes[a].y1);
                if (gapX <= 24 && gapY <= 24) join(a, b);
            }
        }

        const groups = new Map();
        boxes.forEach((box, index) => {
            const root = find(index);
            if (!groups.has(root)) groups.set(root, []);
            groups.get(root).push(box);
        });

        return [...groups.values()].map(group => {
            if (group.length < 4) return null;
            const region = {
                x0: Math.min(...group.map(box => box.x0)),
                x1: Math.max(...group.map(box => box.x1)),
                y0: Math.min(...group.map(box => box.y0)),
                y1: Math.max(...group.map(box => box.y1))
            };
            const width = region.x1 - region.x0;
            const height = region.y1 - region.y0;
            const area = width * height;
            if (width < 35 || height < 30 || area < 1200 || area > pageArea * .45) return null;
            if (region.y0 > viewY1 - 160) return null;
            if (tableRegions.some(table => region.x0 < table.x1 && region.x1 > table.x0 && region.y0 < table.y1 && region.y1 > table.y0)) return null;
            return region;
        }).filter(Boolean);
    }

    function makeTable(region, items, pageNumber, index) {
        const rows = [];
        items.filter(item => item.str.trim()).forEach(item => {
            const x = item.transform[4] + (item.width || 0) / 2;
            const y = item.transform[5];
            if (x < region.x0 - 2 || x > region.x1 + 2 || y < region.y0 - 4 || y > region.y1 + 4) return;
            let row = rows.find(candidate => Math.abs(candidate.y - y) <= 3);
            if (!row) {
                row = { y, items: [] };
                rows.push(row);
            }
            row.items.push(item);
        });

        const columns = region.xs.slice(0, -1).map((left, columnIndex) => ({ left, right: region.xs[columnIndex + 1] })).reverse();
        const populatedRows = rows.sort((a, b) => b.y - a.y).map(row => columns.map(column => {
            const cellItems = row.items.filter(item => {
                const x = item.transform[4] + (item.width || 0) / 2;
                return x >= column.left - 2 && x <= column.right + 2;
            }).sort((a, b) => b.transform[4] - a.transform[4]);
            return cleanPdfText(cellItems.map(item => item.str.trim()).join(' '));
        })).filter(row => row.some(Boolean));

        if (populatedRows.length < 2 || populatedRows.every(row => row.filter(Boolean).length < 2)) return null;

        const figure = document.createElement('figure');
        figure.className = 'pdf-extra-table-wrap';
        const note = document.createElement('p');
        note.className = 'pdf-table-review-note';
        note.textContent = 'رجاء مراجعة الجداول من مصادرها الرئيسية';
        const caption = document.createElement('figcaption');
        caption.textContent = `جدول مستخرج من صفحة ${pageNumber}${index > 1 ? ` (${index})` : ''}`;
        const table = document.createElement('table');
        table.className = 'pdf-extra-table';
        table.dir = 'rtl';
        const body = document.createElement('tbody');
        populatedRows.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            row.forEach(value => {
                const cell = document.createElement(rowIndex === 0 ? 'th' : 'td');
                cell.textContent = value;
                tr.appendChild(cell);
            });
            body.appendChild(tr);
        });
        table.appendChild(body);
        figure.append(note, caption, table);
        return figure;
    }

    function getImageObject(page, id) {
        const image = page.objs.get(id);
        if (image) return Promise.resolve(image);
        return new Promise(resolve => page.objs.get(id, resolve));
    }

    function imageFingerprint(image) {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image.bitmap, 0, 0, 24, 24);
        const pixels = context.getImageData(0, 0, 24, 24).data;
        let hash = 2166136261;
        for (let index = 0; index < pixels.length; index += 4) hash = Math.imul(hash ^ pixels[index], 16777619);
        return `${image.width}x${image.height}:${hash >>> 0}`;
    }

    function imageDataUrl(image) {
        if (!image.bitmap) return null;
        const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        context.drawImage(image.bitmap, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
    }

    function isFullPageRaster(image, page) {
        const pageWidth = page.view[2] - page.view[0];
        const pageHeight = page.view[3] - page.view[1];
        const imageAspect = image.width / image.height;
        const pageAspect = pageWidth / pageHeight;
        const aspectMatch = Math.min(imageAspect / pageAspect, pageAspect / imageAspect) > .92;
        return aspectMatch && image.width > pageWidth * 1.25 && image.height > pageHeight * 1.25;
    }

    function isHadefMark(image) {
        return (image.width === 523 && image.height === 477) || (image.width === 498 && image.height === 480);
    }

    function cropRegion(source, viewport, region) {
        const points = viewport.convertToViewportRectangle([region.x0, region.y0, region.x1, region.y1]);
        const padding = Math.ceil(viewport.scale * 6);
        const x = Math.max(0, Math.floor(Math.min(points[0], points[2]) - padding));
        const y = Math.max(0, Math.floor(Math.min(points[1], points[3]) - padding));
        const right = Math.min(source.width, Math.ceil(Math.max(points[0], points[2]) + padding));
        const bottom = Math.min(source.height, Math.ceil(Math.max(points[1], points[3]) + padding));
        if (right <= x || bottom <= y) return null;
        const crop = document.createElement('canvas');
        crop.width = right - x;
        crop.height = bottom - y;
        crop.getContext('2d').drawImage(source, x, y, crop.width, crop.height, 0, 0, crop.width, crop.height);
        return crop.toDataURL('image/png');
    }

    function addImageFigure(gallery, src, label) {
        const figure = document.createElement('figure');
        figure.className = 'pdf-extra-figure';
        const image = document.createElement('img');
        image.src = src;
        image.alt = label;
        const caption = document.createElement('figcaption');
        caption.textContent = label;
        figure.append(image, caption);
        gallery.appendChild(figure);
    }

    window.extractPdfPageExtras = async function (page, pageNumber, textItems, seenImages) {
        const operatorList = await page.getOperatorList();
        const tableRegions = findGridTables(operatorList);
        const tableFigures = tableRegions.map((region, index) => makeTable(region, textItems, pageNumber, index + 1)).filter(Boolean);
        const vectorRegions = findVectorRegions(operatorList, page, tableRegions);
        const figureAssets = [];
        let annotationRect = null;

        for (let index = 0; index < operatorList.fnArray.length; index++) {
            const operation = operatorList.fnArray[index];
            if (operation === pdfjsLib.OPS.beginAnnotation) annotationRect = operatorList.argsArray[index]?.[1] || null;
            if (operation === pdfjsLib.OPS.paintImageXObject) {
                const args = operatorList.argsArray[index];
                const image = await getImageObject(page, args[0]);
                const isSmallHeaderDecoration = annotationRect && annotationRect[2] - annotationRect[0] < 180 && annotationRect[3] - annotationRect[1] < 180 && annotationRect[1] > page.view[3] - 170;
                if (image?.bitmap && !isSmallHeaderDecoration && !isFullPageRaster(image, page) && !isHadefMark(image)) {
                    const fingerprint = imageFingerprint(image);
                    if (!seenImages.has(fingerprint)) {
                        seenImages.add(fingerprint);
                        const src = imageDataUrl(image);
                        if (src) figureAssets.push({ src, label: `رسم مستخرج من صفحة ${pageNumber}` });
                    }
                }
            }
            if (operation === pdfjsLib.OPS.endAnnotation) annotationRect = null;
        }

        if (vectorRegions.length) {
            const viewport = page.getViewport({ scale: 1.25 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const context = canvas.getContext('2d', { alpha: false });
            await page.render({ canvasContext: context, viewport }).promise;
            vectorRegions.forEach((region, index) => {
                const src = cropRegion(canvas, viewport, region);
                if (src) figureAssets.push({ src, label: `رسم متجهي مستخرج من صفحة ${pageNumber}${index ? ` (${index + 1})` : ''}` });
            });
        }

        if (!tableFigures.length && !figureAssets.length) return null;
        const section = document.createElement('section');
        section.className = 'pdf-extra-content';
        const heading = document.createElement('h5');
        heading.className = 'pdf-extra-heading';
        heading.textContent = 'الجداول والرسومات';
        section.appendChild(heading);
        tableFigures.forEach(figure => section.appendChild(figure));
        if (figureAssets.length) {
            const gallery = document.createElement('div');
            gallery.className = 'pdf-extra-gallery';
            figureAssets.forEach(asset => addImageFigure(gallery, asset.src, asset.label));
            section.appendChild(gallery);
        }
        return section;
    };
})();
