(async () => {
  const mapComponent = document.querySelector("arcgis-map");
  // Load ArcGIS modules dynamically
  const [
    FeatureLayer,
    ClassBreaksRenderer,
    SimpleLineSymbol, Popup, Graphic, Point, SimpleMarkerSymbol, geometryEngine
  ] = await Promise.all([
    $arcgis.import("@arcgis/core/layers/FeatureLayer.js"),
    $arcgis.import("@arcgis/core/renderers/ClassBreaksRenderer.js"),
    $arcgis.import("@arcgis/core/symbols/SimpleLineSymbol.js"),
    $arcgis.import("@arcgis/core/widgets/Popup.js"),
    $arcgis.import("@arcgis/core/Graphic.js"),
    $arcgis.import("@arcgis/core/geometry/Point.js"),
    $arcgis.import("@arcgis/core/symbols/SimpleMarkerSymbol.js"),
    $arcgis.import("@arcgis/core/geometry/geometryEngine.js")
  ]);

  // Define your line layer (no renderer yet)
  const subsidenceLine = new FeatureLayer({
    url: "https://services.arcgis.com/JL4BwWcjcPuWhBm9/arcgis/rest/services/subsidence_map_line_highres/FeatureServer",
    title: "Subsidence Lines"
  });

  // Base color palette for 7 breaks
  const legendInfo = {
    colors: ["#00FF00", "#7FFF00", "#FFFF00", "#FFD700", "#FFA500", "#FF4500", "#FF0000"]
  };

  // --- Helper: get min/max from a field using outStatistics
  async function getFieldRange(fieldName) {
    const query = subsidenceLine.createQuery();
    query.outStatistics = [
      { onStatisticField: fieldName, outStatisticFieldName: "minValue", statisticType: "min" },
      { onStatisticField: fieldName, outStatisticFieldName: "maxValue", statisticType: "max" }
    ];
    const result = await subsidenceLine.queryFeatures(query);
    const stats = result.features[0].attributes;
    return { min: stats.minValue ?? 0, max: stats.maxValue ?? 0 };
  }

  // --- Helper: build 7 equal intervals from 0 to rounded max
  function makeDynamicBreaks(min, max) {
    const roundedMax = Math.ceil(max / 5) * 5;
    const step = (roundedMax - 0) / 7;
    const breaks = [];
    for (let i = 0; i < 7; i++) {
      breaks.push({
        min: i * step,
        max: (i + 1) * step
      });
    }
    return { breaks, roundedMax };
  }

  // --- Create a class-breaks renderer dynamically
  function makeRenderer(fieldName, breaks) {
    const renderer = new ClassBreaksRenderer({
      type: "class-breaks",
      field: fieldName,
      defaultSymbol: new SimpleLineSymbol({
        color: [200, 200, 200, 0.5],
        width: 8
      }),
      defaultLabel: "No data"
    });

    breaks.forEach((b, i) => {
      renderer.addClassBreakInfo({
        minValue: b.min,
        maxValue: b.max,
        symbol: new SimpleLineSymbol({
          color: legendInfo.colors[i],
          width: 8
        }),
        label: `${b.min.toFixed(1)} – ${b.max.toFixed(1)}`
      });
    });

    return renderer;
  }

  // --- Manual legend generator
  const legendDiv = document.getElementById("legend");

  function renderLegend(fieldLabel, roundedMax) {
    // Clear any previous legend
    legendDiv.innerHTML = "";

    // --- Outer horizontal container (bar + labels on left, text on right) ---
    const outer = document.createElement("div");
    outer.style.display = "flex";
    outer.style.alignItems = "center";
    outer.style.gap = "10px"; // space between left and right
    outer.style.position = "relative";
    outer.style.marginTop = "5px";
    outer.style.flexWrap="nowrap";
    // --- Left side: bar + percent labels ---
    const leftContainer = document.createElement("div");
    leftContainer.style.display = "flex";
    leftContainer.style.alignItems = "center";
    leftContainer.style.position = "relative";

    // Color bar
    const bar = document.createElement("div");
    bar.style.display = "flex";
    bar.style.flexDirection = "column-reverse";
    bar.style.height = "100px";
    bar.style.width = "20px";
    bar.style.border = "1px solid #aaa";

    legendInfo.colors.forEach(color => {
      const seg = document.createElement("div");
      seg.style.flex = "1";
      seg.style.backgroundColor = color;
      bar.appendChild(seg);
    });

    // Labels (0% and max%)
    const labels = document.createElement("div");
    labels.style.display = "flex";
    labels.style.flexDirection = "column-reverse";
    labels.style.height = "100px";
    labels.style.justifyContent = "space-between";
    labels.style.marginLeft = "6px";
    labels.style.position = "relative";

    const minLabel = document.createElement("div");
    minLabel.textContent = "0%";
    minLabel.style.whiteSpace = "nowrap";

    const maxLabel = document.createElement("div");
    maxLabel.textContent = `${roundedMax}%`;
    maxLabel.style.whiteSpace = "nowrap";

    labels.appendChild(minLabel);
    labels.appendChild(maxLabel);

    leftContainer.appendChild(bar);
    leftContainer.appendChild(labels);

    // --- Right side: text section ---
    const textDiv = document.createElement("div");
    textDiv.textContent = fieldLabel;

    // --- Assemble ---
    outer.appendChild(leftContainer);
    outer.appendChild(textDiv);
    legendDiv.appendChild(outer);
  }

  // --- Wait for map to be ready
  mapComponent.addEventListener("arcgisViewReadyChange", async (event) => {
    const view = event.target.view;
    if (!view) return;

    const map = view.map;
    map.add(subsidenceLine);

    const cmSelect = document.getElementById("cmSelect");
    const yearSelect = document.getElementById("yearSelect");
    const condSelect = document.getElementById("condSelect");

    // Build current field name from all selections
    function getSelectedField() {
      const cm = cmSelect.value;
      const yr = yearSelect.value;
      const cond = condSelect.value;
      return `${cond}_${cm}_${yr}`;
    }

    // Build label for legend
    function getSelectedLabel() {
      const condLabel = condSelect.selectedOptions[0].textContent;
      return `Probability of exceeding ${cmSelect.value}cm subsidence in the next ${yearSelect.value} years`;
    }
  
  
    // --- Update map + legend dynamically
    async function updateRenderer() {
      const fieldName = getSelectedField();
      const label = getSelectedLabel();

      // 1. Get min/max stats for the field
      const { min, max } = await getFieldRange(fieldName);
      // 2. Build dynamic breaks (0 to rounded max)
      const { breaks, roundedMax } = makeDynamicBreaks(min, max);

      // 3. Apply new renderer
      subsidenceLine.renderer = makeRenderer(fieldName, breaks);

      // 4. Update legend
      renderLegend(label, roundedMax);
    }

    // Initial render
    await updateRenderer();

    // Change handler
    [cmSelect, yearSelect, condSelect].forEach(sel => {
      sel.addEventListener("change", updateRenderer);
    });
  let locationList = [];

  async function loadCoastalPoints() {
    try {
      const response = await fetch("coastal_points.txt");
      if (!response.ok) throw new Error("Failed to load coastal_points.txt");
      const text = await response.text();

    // Parse each line: "lon lat" → { lat, lon }
      locationList = text
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const [lon, lat] = line.split(/\s+/).map(Number);
        return { lat, lon };
      });

      console.log(`Loaded ${locationList.length} coastal points.`);
    } catch (err) {
      console.error("Error loading coastal_points.txt:", err);
    }
  }

// Load once when view is ready
  await loadCoastalPoints();  
  view.on("click", async function (event) {
    const mapPoint = view.toMap({ x: event.x, y: event.y });

    const clickedLat = mapPoint.latitude;
    const clickedLon = mapPoint.longitude;

    console.log("Clicked:", clickedLat, clickedLon);

    const query = subsidenceLine.createQuery();
    query.geometry = mapPoint;
    query.distance = 10000; // meters, i.e. 5 km from the coast
    query.units = "meters";
    query.spatialRelationship = "intersects";
    query.returnGeometry = true;
      let isNearCoast = false;
    try {
      const result = await subsidenceLine.queryFeatures(query);
      isNearCoast = result.features.length > 0;
    } catch (err) {
      console.error("Coastline query error:", err);
    }

    if (!isNearCoast) {
      console.log("Not close to coast — skipping marker and popup.");
      view.graphics.removeAll();
      return;
    }
    function getClosestIndex(lat, lon, coords) {
      let minDist = Infinity;
      let closestIndex = -1;
      for (let i = 0; i < coords.length; i++) {
        const dLat = lat - coords[i].lat;
        const dLon = lon - coords[i].lon;
        const dist = Math.sqrt(dLat * dLat + dLon * dLon); // degrees-based distance
        if (dist < minDist) {
          minDist = dist;
          closestIndex = i;
        }
      }
      return closestIndex;
    }

    const closestIndex = getClosestIndex(clickedLat, clickedLon, locationList);
    console.log("Closest index:", closestIndex);
    const yearValue = yearSelect.value;

    // --- Step 5. Add a red marker on the map
    view.graphics.removeAll();
    const pointGraphic = new Graphic({
      geometry: mapPoint,
      symbol: new SimpleMarkerSymbol({
        color: [0, 0, 0, 1],
        size: 8,
        outline: { color: [255, 255, 255], width: 1 }
      })
    });
    view.graphics.add(pointGraphic);
    // --- Step 4. Build image path dynamically
    const imageBase = `./images/new_result_smoothed_10272025_${closestIndex}_${yearValue}`;
    const hazardBase = `./images/Hazard_curvenew_result_smoothed_10272025_${closestIndex}_${yearValue}`;
    const imageFiles = [
      { src: `${imageBase}_bo.png`, title: "Overall Probability" },
      { src: `${imageBase}_y.png`,  title: "At least 1 Earthquake Affects the Area" },
      { src: `${imageBase}_n.png`,  title: "No Earthquake Affects the Area" },
      { src: `${hazardBase}.png`,  title: "Overall Exceedance Hazard Curve" }
    ];
    // const imageFile = `new_result_smoothed_10272025_${closestIndex}_${yearValue}.png`;
    // const imagePath = `./images/${imageFile}`; // adjust if in subfolder

    // --- Step 6. Open popup with image
    const popupContent = document.createElement("div");
    popupContent.style.textAlign = "center";
    popupContent.style.width = "40vw"; 


    let currentIndex = 0;

    // const imgTitle = document.createElement("div");
    // imgTitle.textContent = imageFiles[currentIndex].title;
    // imgTitle.style.marginTop = "0px";
    // imgTitle.style.fontWeight = "bold";
    // popupContent.appendChild(imgTitle);
    
    const img = document.createElement("img");
    img.src = imageFiles[currentIndex].src;
    //img.alt = "Probability";
    img.style.maxWidth="100%";
    img.style.height="auto";
    img.style.borderRadius = "8px";
    img.style.border = "1px solid #ffffffff";
    popupContent.appendChild(img);

    console.log(img.src);


    // Navigation buttons
    const btnContainer = document.createElement("div");
    btnContainer.style.marginTop = "6px";
    btnContainer.style.display = "flex";
    btnContainer.style.justifyContent = "space-between";

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "◀ Prev";
    prevBtn.style.padding = "4px 8px";
    prevBtn.style.cursor = "pointer";
    prevBtn.disabled = true;

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next ▶";
    nextBtn.style.padding = "4px 8px";
    nextBtn.style.cursor = "pointer";

    btnContainer.appendChild(prevBtn);
    btnContainer.appendChild(nextBtn);
    popupContent.appendChild(btnContainer);

    // Button behavior
    function updateImage() {
      img.src = imageFiles[currentIndex].src;
      //imgTitle.textContent = imageFiles[currentIndex].title;
      prevBtn.disabled = currentIndex === 0;
      nextBtn.disabled = currentIndex === imageFiles.length - 1;
      console.log(imageFiles[currentIndex].src);
    }

    prevBtn.addEventListener("click", () => {
      if (currentIndex > 0) {
        currentIndex--;
        updateImage();
      }
    });

    nextBtn.addEventListener("click", () => {
      if (currentIndex < imageFiles.length - 1) {
        currentIndex++;
        updateImage();
      }
    });

    view.popup.open({
      title: `Probability of vertical land motion in the next ${yearValue} years at the closest coastal point (${clickedLat.toFixed(1)}\u00B0 N,${-clickedLon.toFixed(1)}\u00B0 W)`,
      location: mapPoint,
      content: popupContent,
      includeDefaultActions: false,
      dockOptions: {
        buttonEnabled: false}
    });
  });   // closes view.on("click", …)
});     // closes mapComponent.addEventListener("arcgisViewReadyChange", …)
})(); //closes IIFE
