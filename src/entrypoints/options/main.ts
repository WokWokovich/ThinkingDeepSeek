import {
  copyButtonEnabled,
  previousThinkingEnabled,
} from "@/utils/settings.ts";

const copyInput = document.querySelector("#copyButtonEnabled") as HTMLInputElement;
const prevInput = document.querySelector("#previousThinkingEnabled") as HTMLInputElement;

async function init() {
  try {
    copyInput.checked = await copyButtonEnabled.getValue();
    prevInput.checked = await previousThinkingEnabled.getValue();
  } catch (e) {
    console.log("[TDS] options load failed", e);
  }
}

copyInput.addEventListener("change", async () => {
  try {
    await copyButtonEnabled.setValue(copyInput.checked);
  } catch (e) {
    console.log("[TDS] save copyButtonEnabled failed", e);
  }
});

prevInput.addEventListener("change", async () => {
  try {
    await previousThinkingEnabled.setValue(prevInput.checked);
  } catch (e) {
    console.log("[TDS] save previousThinkingEnabled failed", e);
  }
});

init();
