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

  const pipeline = document.createElement("div");
  pipeline.className = "pipeline" + (size === "lg" ? " pipeline-lg" : "");

  steps.forEach((label, i) => {
    const step = document.createElement("div");
    step.className = "pipeline-step";

    if (dangerStep != null && i === dangerStep) {
      step.classList.add("danger");
    } else if (i < currentStep) {
      step.classList.add("completed");
    } else if (i === currentStep) {
      step.classList.add("current");
    }

    let html = label;
    if (dates[i]) {
      html += `<span class="step-date">${dates[i]}</span>`;
    }
    step.innerHTML = html;
    pipeline.appendChild(step);
  });

  container.innerHTML = "";
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
