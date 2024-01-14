import { Setting } from "obsidian";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";

export function addTrackedNoteToDecksSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    // const plugin = this.plugin;

    new Setting(containerEl)
        .setName(t("CONVERT_TRACKED_TO_DECK"))
        .setDesc(t("CONVERT_FOLDERS_TO_DECKS_DESC"))
        .addToggle((toggle) => {
            toggle.setValue(plugin.data.settings.trackedNoteToDecks).onChange((newValue) => {
                plugin.data.settings.trackedNoteToDecks = newValue;
                plugin.savePluginData();
            });
        });
}

export function addUntrackSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    // const plugin = this.plugin;
    const settings = plugin.data.settings;
    const desc = createFragment((frag) => {
        frag.createDiv().innerHTML =
            "在删除笔记中复习标签时，即同步untrack操作，以后不再复习该笔记<br>\
        <b>true</b>: 同步untrack操作；<br>\
        <b>false</b>：删除复习标签后，需再次untrack，才不再复习该笔记。（同之前版本）";
    });
    new Setting(containerEl)
        .setName(t("UNTRACK_WITH_REVIEWTAG"))
        .setDesc(desc)
        .addToggle((toggle) =>
            toggle.setValue(settings.untrackWithReviewTag).onChange(async (value) => {
                settings.untrackWithReviewTag = value;
                await plugin.savePluginData();
            }),
        );
}
