/* ==========================================================================
   BILL PIPELINE RENDERER — Reusable across landing + detail pages

   Usage:
     renderPipeline(containerEl, chamber, currentStepIndex, options)

   chamber: 'house' | 'senate' — determines step labels
   currentStepIndex: 0-based index of the current step
     - All steps before it are "completed"
     - The step at that index is "current"
     - Steps after are pending

   options: {
     size: 'sm' | 'lg',           // default 'sm'
     dates: { 0: 'Mar 6', ... },  // optional date labels per step index
     dangerStep: null | number     // mark a step as danger instead of current
   }
   ========================================================================== */

const HOUSE_STEPS = [
  "Introduced",
  "Referred to Committee",
  "Committee Hearings",
  "Reported from Committee",
  "House Floor Vote",
  "Sent to Senate",
  "Senate Committee",
  "Senate Floor Vote",
  "Governor",
];

const SENATE_STEPS = [
  "Introduced",
  "Referred to Committee",
  "Committee Hearings",
  "Reported from Committee",
  "Senate Floor Vote",
  "Sent to House",
  "House Committee",
  "House Floor Vote",
  "Governor",
];

function renderPipeline(container, chamber, currentStep, options = {}) {
  const steps = chamber === "senate" ? SENATE_STEPS : HOUSE_STEPS;
  const size = options.size || "sm";
  const dates = options.dates || {};
  const dangerStep = options.dangerStep != null ? options.dangerStep : null;
  const isDanger = dangerStep != null;
  const headlineIdx = isDanger ? dangerStep : currentStep;
  const headlineLabel = steps[headlineIdx] || steps[steps.length - 1] || "";

  const pipeline = document.createElement("ol");
  pipeline.className = "pipeline" + (size === "lg" ? " pipeline-lg" : "");
  pipeline.setAttribute("aria-label",
    `Legislative progress: step ${headlineIdx + 1} of ${steps.length} — ${headlineLabel}`);

  steps.forEach((label, i) => {
    const step = document.createElement("li");
    step.className = "pipeline-step";
    let stateLabel = "Pending";

    if (dangerStep != null && i === dangerStep) {
      step.classList.add("danger");
      stateLabel = "Stalled at";
    } else if (i < currentStep) {
      step.classList.add("completed");
      stateLabel = "Completed";
    } else if (i === currentStep) {
      step.classList.add("current");
      step.setAttribute("aria-current", "step");
      stateLabel = "Current step";
    }
    step.setAttribute("aria-label", `${stateLabel}: ${label}` + (dates[i] ? ` (${dates[i]})` : ""));

    let html = label;
    if (dates[i]) {
      html += `<span class="step-date">${dates[i]}</span>`;
    }
    step.innerHTML = html;
    pipeline.appendChild(step);
  });

  container.innerHTML = "";

  // Compact mobile-only "current stage" badge for narrow viewports. Renders
  // inline above the full pipeline; CSS hides one or the other depending on
  // viewport width. Skipped on the `pipeline-lg` (detail page) to avoid
  // duplication where the timeline below already gives the context.
  if (size !== "lg") {
    const compact = document.createElement("div");
    compact.className = "pipeline-compact";
    compact.setAttribute("aria-hidden", "true");
    const stageClass = isDanger ? "pipeline-compact-stage danger" : "pipeline-compact-stage";
    compact.innerHTML =
      `<span class="pipeline-compact-label">${isDanger ? "Stalled at" : "Current"}</span>` +
      `<span class="${stageClass}">${headlineLabel}</span>` +
      `<span class="pipeline-compact-progress">Step ${headlineIdx + 1} of ${steps.length}</span>`;
    container.appendChild(compact);
  }

  container.appendChild(pipeline);
}

// Convenience for rendering on page load by data attribute
function initPipelines() {
  document.querySelectorAll("[data-pipeline]").forEach((el) => {
    const chamber = el.dataset.chamber || "house";
    const current = parseInt(el.dataset.currentStep || "0", 10);
    const size = el.dataset.pipelineSize || "sm";
    let dates = {};
    if (el.dataset.dates) {
      try {
        dates = JSON.parse(el.dataset.dates);
      } catch (e) {}
    }
    const danger =
      el.dataset.dangerStep != null
        ? parseInt(el.dataset.dangerStep, 10)
        : null;
    renderPipeline(el, chamber, current, { size, dates, dangerStep: danger });
  });
}

document.addEventListener("DOMContentLoaded", initPipelines);
