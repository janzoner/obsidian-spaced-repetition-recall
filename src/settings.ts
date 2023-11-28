import { Notice, PluginSettingTab, Setting, App, Platform } from "obsidian";
import type SRPlugin from "src/main";
import { t } from "src/lang/helpers";

// https://github.com/martin-jw/obsidian-recall/blob/main/src/settings.ts
import ConfirmModal from "src/gui/confirm";
import { FolderSuggest } from "./suggesters/FolderSuggester";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import QR_alipay from ".github/funding/QR_alipay.png";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import QR_wechat from ".github/funding/QR_wechat.png";
import { algorithmNames, algorithmSwitchData, algorithms } from "./algorithms/algorithms_switch";
import { DataLocation, LocationSwitch, locationMap } from "./dataStore/location_switch";
import deepcopy from "deepcopy";

export interface SRSettings {
    // flashcards
    responseOptionBtnsText: Record<string, string[]>;
    flashcardEasyText: string;
    flashcardGoodText: string;
    flashcardHardText: string;
    flashcardTags: string[];
    convertFoldersToDecks: boolean;
    cardCommentOnSameLine: boolean;
    burySiblingCards: boolean;
    showContextInCards: boolean;
    flashcardHeightPercentage: number;
    flashcardWidthPercentage: number;
    randomizeCardOrder: boolean;
    convertHighlightsToClozes: boolean;
    convertBoldTextToClozes: boolean;
    convertCurlyBracketsToClozes: boolean;
    singleLineCardSeparator: string;
    singleLineReversedCardSeparator: string;
    multilineCardSeparator: string;
    multilineReversedCardSeparator: string;
    editLaterTag: string;
    intervalShowHide: boolean;
    // notes
    enableNoteReviewPaneOnStartup: boolean;
    tagsToReview: string[];
    noteFoldersToIgnore: string[];
    openRandomNote: boolean;
    autoNextNote: boolean;
    reviewResponseFloatBar: boolean;
    reviewingNoteDirectly: boolean;
    disableFileMenuReviewOptions: boolean;
    maxNDaysNotesReviewQueue: number;
    // UI preferences
    initiallyExpandAllSubdecksInTree: boolean;
    // algorithm
    baseEase: number;
    lapsesIntervalChange: number;
    easyBonus: number;
    maximumInterval: number;
    maxLinkFactor: number;
    // logging
    showDebugMessages: boolean;

    // trackfile: https://github.com/martin-jw/obsidian-recall/blob/main/src/settings.ts
    dataLocation: DataLocation;
    customFolder: string;
    maxNewPerDay: number;
    repeatItems: boolean;
    trackedNoteToDecks: boolean;
    algorithm: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    algorithmSettings: any;

    previousRelease: string;
}

export const DEFAULT_SETTINGS: SRSettings = {
    // flashcards
    responseOptionBtnsText: {
        Default: [t("RESET"), t("HARD"), t("GOOD"), t("EASY")],
        Fsrs: [t("RESET"), t("HARD"), t("GOOD"), t("EASY")],
        Anki: [t("RESET"), t("HARD"), t("GOOD"), t("EASY")],
        SM2: ["Blackout", "Incorrect", "Incorrect (Easy)", t("HARD"), t("GOOD"), t("EASY")],
    },
    flashcardEasyText: t("EASY"),
    flashcardGoodText: t("GOOD"),
    flashcardHardText: t("HARD"),
    flashcardTags: ["#flashcards"],
    convertFoldersToDecks: false,
    cardCommentOnSameLine: false,
    burySiblingCards: false,
    showContextInCards: true,
    flashcardHeightPercentage: Platform.isMobile ? 100 : 80,
    flashcardWidthPercentage: Platform.isMobile ? 100 : 40,
    randomizeCardOrder: true,
    convertHighlightsToClozes: true,
    convertBoldTextToClozes: false,
    convertCurlyBracketsToClozes: false,
    singleLineCardSeparator: "::",
    singleLineReversedCardSeparator: ":::",
    multilineCardSeparator: "?",
    multilineReversedCardSeparator: "??",
    editLaterTag: "#edit-later",
    intervalShowHide: true,
    // notes
    enableNoteReviewPaneOnStartup: true,
    tagsToReview: ["#review"],
    noteFoldersToIgnore: [],
    openRandomNote: false,
    autoNextNote: false,
    reviewResponseFloatBar: false,
    reviewingNoteDirectly: false,
    disableFileMenuReviewOptions: false,
    maxNDaysNotesReviewQueue: 365,
    // UI settings
    initiallyExpandAllSubdecksInTree: false,
    // algorithm
    baseEase: 250,
    lapsesIntervalChange: 0.5,
    easyBonus: 1.3,
    maximumInterval: 36525,
    maxLinkFactor: 1.0,
    // logging
    showDebugMessages: false,

    // trackfile: https://github.com/martin-jw/obsidian-recall/blob/main/src/settings.ts
    dataLocation: DataLocation.SaveOnNoteFile,
    customFolder: "",
    maxNewPerDay: -1,
    repeatItems: false,
    trackedNoteToDecks: false,
    algorithm: Object.keys(algorithms)[0],
    algorithmSettings: { algorithm: Object.values(algorithms)[0].settings },
    previousRelease: "0.0.0",
};

// https://github.com/mgmeyers/obsidian-kanban/blob/main/src/Settings.ts
let applyDebounceTimer = 0;
function applySettingsUpdate(callback: () => void): void {
    clearTimeout(applyDebounceTimer);
    applyDebounceTimer = window.setTimeout(callback, 512);
}

export class SRSettingTab extends PluginSettingTab {
    private plugin: SRPlugin;

    constructor(app: App, plugin: SRPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        const header = containerEl.createEl("h1", { text: `${t("SETTINGS_HEADER")}` });
        header.addClass("sr-centered");

        containerEl.createDiv().innerHTML = t("CHECK_WIKI", {
            wiki_url: "https://www.stephenmwangi.com/obsidian-spaced-repetition/",
        });
        const issue_url =
            "https://github.com/open-spaced-repetition/obsidian-spaced-repetition-recall/issues";
        containerEl.createDiv().innerHTML = `有空时可以看看 <a href= ${issue_url} > issue </a> .`;

        // trackfile_setting
        // https://github.com/martin-jw/obsidian-recall/blob/main/src/settings.ts
        this.addDataLocationSettings(containerEl);
        if (this.plugin.data.settings.dataLocation === DataLocation.SpecifiedFolder) {
            this.plugin.data.settings.customFolder = this.plugin.store.dataPath;
            this.addSpecifiedFolderSetting(containerEl);
        }
        this.addAlgorithmSetting(containerEl);
        // this.addNewPerDaySetting(containerEl);
        this.addRepeatItemsSetting(containerEl);
        this.addTrackedNoteToDecksSetting(containerEl);
        this.addReviewResponseFloatBarSetting(containerEl);

        new Setting(containerEl)
            .setName(t("FOLDERS_TO_IGNORE"))
            .setDesc(t("FOLDERS_TO_IGNORE_DESC"))
            .addTextArea((text) =>
                text
                    .setValue(this.plugin.data.settings.noteFoldersToIgnore.join("\n"))
                    .onChange((value) => {
                        applySettingsUpdate(async () => {
                            this.plugin.data.settings.noteFoldersToIgnore = value
                                .split(/\n+/)
                                .map((v) => v.trim())
                                .filter((v) => v);
                            await this.plugin.savePluginData();
                        });
                    }),
            );

        containerEl.createEl("h3", { text: `${t("FLASHCARDS")}` });

        new Setting(containerEl)
            .setName(t("FLASHCARD_TAGS"))
            .setDesc(t("FLASHCARD_TAGS_DESC"))
            .addTextArea((text) =>
                text
                    .setValue(this.plugin.data.settings.flashcardTags.join(" "))
                    .onChange((value) => {
                        applySettingsUpdate(async () => {
                            this.plugin.data.settings.flashcardTags = value.split(/\s+/);
                            await this.plugin.savePluginData();
                        });
                    }),
            );

        new Setting(containerEl)
            .setName(t("CONVERT_FOLDERS_TO_DECKS"))
            .setDesc(t("CONVERT_FOLDERS_TO_DECKS_DESC"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.data.settings.convertFoldersToDecks)
                    .onChange(async (value) => {
                        this.plugin.data.settings.convertFoldersToDecks = value;
                        await this.plugin.savePluginData();
                    }),
            );

        new Setting(containerEl)
            .setName(t("INLINE_SCHEDULING_COMMENTS"))
            .setDesc(t("INLINE_SCHEDULING_COMMENTS_DESC"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.data.settings.cardCommentOnSameLine)
                    .onChange(async (value) => {
                        this.plugin.data.settings.cardCommentOnSameLine = value;
                        await this.plugin.savePluginData();
                    }),
            );

        new Setting(containerEl)
            .setName(t("BURY_SIBLINGS_TILL_NEXT_DAY"))
            .setDesc(t("BURY_SIBLINGS_TILL_NEXT_DAY_DESC"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.data.settings.burySiblingCards)
                    .onChange(async (value) => {
                        this.plugin.data.settings.burySiblingCards = value;
                        await this.plugin.savePluginData();
                    }),
            );

        new Setting(containerEl)
            .setName(t("SHOW_CARD_CONTEXT"))
            .setDesc(t("SHOW_CARD_CONTEXT_DESC"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.data.settings.showContextInCards)
                    .onChange(async (value) => {
                        this.plugin.data.settings.showContextInCards = value;
                        await this.plugin.savePluginData();
                    }),
            );

        new Setting(containerEl)
            .setName(t("CARD_MODAL_HEIGHT_PERCENT"))
            .setDesc(t("CARD_MODAL_SIZE_PERCENT_DESC"))
            .addSlider((slider) =>
                slider
                    .setLimits(10, 100, 5)
                    .setValue(this.plugin.data.settings.flashcardHeightPercentage)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.data.settings.flashcardHeightPercentage = value;
                        await this.plugin.savePluginData();
                    }),
            )
            .addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip(t("RESET_DEFAULT"))
                    .onClick(async () => {
                        this.plugin.data.settings.flashcardHeightPercentage =
                            DEFAULT_SETTINGS.flashcardHeightPercentage;
                        await this.plugin.savePluginData();
                        this.display();
                    });
            });

        new Setting(containerEl)
            .setName(t("CARD_MODAL_WIDTH_PERCENT"))
            .setDesc(t("CARD_MODAL_SIZE_PERCENT_DESC"))
            .addSlider((slider) =>
                slider
                    .setLimits(10, 100, 5)
                    .setValue(this.plugin.data.settings.flashcardWidthPercentage)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.data.settings.flashcardWidthPercentage = value;
                        await this.plugin.savePluginData();
                    }),
            )
            .addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip(t("RESET_DEFAULT"))
                    .onClick(async () => {
                        this.plugin.data.settings.flashcardWidthPercentage =
                            DEFAULT_SETTINGS.flashcardWidthPercentage;
                        await this.plugin.savePluginData();
                        this.display();
                    });
            });

        new Setting(containerEl).setName(t("RANDOMIZE_CARD_ORDER")).addToggle((toggle) =>
            toggle
                .setValue(this.plugin.data.settings.randomizeCardOrder)
                .onChange(async (value) => {
                    this.plugin.data.settings.randomizeCardOrder = value;
                    await this.plugin.savePluginData();
                }),
        );

        new Setting(containerEl).setName(t("CONVERT_HIGHLIGHTS_TO_CLOZES")).addToggle((toggle) =>
            toggle
                .setValue(this.plugin.data.settings.convertHighlightsToClozes)
                .onChange(async (value) => {
                    this.plugin.data.settings.convertHighlightsToClozes = value;
                    await this.plugin.savePluginData();
                }),
        );

        new Setting(containerEl).setName(t("CONVERT_BOLD_TEXT_TO_CLOZES")).addToggle((toggle) =>
            toggle
                .setValue(this.plugin.data.settings.convertBoldTextToClozes)
                .onChange(async (value) => {
                    this.plugin.data.settings.convertBoldTextToClozes = value;
                    await this.plugin.savePluginData();
                }),
        );

        new Setting(containerEl)
            .setName(t("CONVERT_CURLY_BRACKETS_TO_CLOZES"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.data.settings.convertCurlyBracketsToClozes)
                    .onChange(async (value) => {
                        this.plugin.data.settings.convertCurlyBracketsToClozes = value;
                        await this.plugin.savePluginData();
                    }),
            );

        new Setting(containerEl)
            .setName(t("INLINE_CARDS_SEPARATOR"))
            .setDesc(t("FIX_SEPARATORS_MANUALLY_WARNING"))
            .addText((text) =>
                text
                    .setValue(this.plugin.data.settings.singleLineCardSeparator)
                    .onChange((value) => {
                        applySettingsUpdate(async () => {
                            this.plugin.data.settings.singleLineCardSeparator = value;
                            await this.plugin.savePluginData();
                        });
                    }),
            )
            .addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip(t("RESET_DEFAULT"))
                    .onClick(async () => {
                        this.plugin.data.settings.singleLineCardSeparator =
                            DEFAULT_SETTINGS.singleLineCardSeparator;
                        await this.plugin.savePluginData();
                        this.display();
                    });
            });

        new Setting(containerEl)
            .setName(t("INLINE_REVERSED_CARDS_SEPARATOR"))
            .setDesc(t("FIX_SEPARATORS_MANUALLY_WARNING"))
            .addText((text) =>
                text
                    .setValue(this.plugin.data.settings.singleLineReversedCardSeparator)
                    .onChange((value) => {
                        applySettingsUpdate(async () => {
                            this.plugin.data.settings.singleLineReversedCardSeparator = value;
                            await this.plugin.savePluginData();
                        });
                    }),
            )
            .addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip(t("RESET_DEFAULT"))
                    .onClick(async () => {
                        this.plugin.data.settings.singleLineReversedCardSeparator =
                            DEFAULT_SETTINGS.singleLineReversedCardSeparator;
                        await this.plugin.savePluginData();
                        this.display();
                    });
            });

        new Setting(containerEl)
            .setName(t("MULTILINE_CARDS_SEPARATOR"))
            .setDesc(t("FIX_SEPARATORS_MANUALLY_WARNING"))
            .addText((text) =>
                text
                    .setValue(this.plugin.data.settings.multilineCardSeparator)
                    .onChange((value) => {
                        applySettingsUpdate(async () => {
                            this.plugin.data.settings.multilineCardSeparator = value;
                            await this.plugin.savePluginData();
                        });
                    }),
            )
            .addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip(t("RESET_DEFAULT"))
                    .onClick(async () => {
                        this.plugin.data.settings.multilineCardSeparator =
                            DEFAULT_SETTINGS.multilineCardSeparator;
                        await this.plugin.savePluginData();
                        this.display();
                    });
            });

        new Setting(containerEl)
            .setName(t("MULTILINE_REVERSED_CARDS_SEPARATOR"))
            .setDesc(t("FIX_SEPARATORS_MANUALLY_WARNING"))
            .addText((text) =>
                text
                    .setValue(this.plugin.data.settings.multilineReversedCardSeparator)
                    .onChange((value) => {
                        applySettingsUpdate(async () => {
                            this.plugin.data.settings.multilineReversedCardSeparator = value;
                            await this.plugin.savePluginData();
                        });
                    }),
            )
            .addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip(t("RESET_DEFAULT"))
                    .onClick(async () => {
                        this.plugin.data.settings.multilineReversedCardSeparator =
                            DEFAULT_SETTINGS.multilineReversedCardSeparator;
                        await this.plugin.savePluginData();
                        this.display();
                    });
            });

        this.addIntervalShowHideSetting(containerEl);

        containerEl.createEl("h3", { text: `${t("NOTES")}` });

        new Setting(containerEl).setName(t("REVIEW_PANE_ON_STARTUP")).addToggle((toggle) =>
            toggle
                .setValue(this.plugin.data.settings.enableNoteReviewPaneOnStartup)
                .onChange(async (value) => {
                    this.plugin.data.settings.enableNoteReviewPaneOnStartup = value;
                    await this.plugin.savePluginData();
                }),
        );

        new Setting(containerEl)
            .setName(t("TAGS_TO_REVIEW"))
            .setDesc(t("TAGS_TO_REVIEW_DESC"))
            .addTextArea((text) =>
                text
                    .setValue(this.plugin.data.settings.tagsToReview.join(" "))
                    .onChange((value) => {
                        applySettingsUpdate(async () => {
                            this.plugin.data.settings.tagsToReview = value.split(/\s+/);
                            await this.plugin.savePluginData();
                        });
                    }),
            );

        new Setting(containerEl)
            .setName(t("OPEN_RANDOM_NOTE"))
            .setDesc(t("OPEN_RANDOM_NOTE_DESC"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.data.settings.openRandomNote)
                    .onChange(async (value) => {
                        this.plugin.data.settings.openRandomNote = value;
                        await this.plugin.savePluginData();
                    }),
            );

        new Setting(containerEl).setName(t("AUTO_NEXT_NOTE")).addToggle((toggle) =>
            toggle.setValue(this.plugin.data.settings.autoNextNote).onChange(async (value) => {
                this.plugin.data.settings.autoNextNote = value;
                await this.plugin.savePluginData();
            }),
        );

        this.addReviewNoteDirectlySetting(containerEl);

        new Setting(containerEl)
            .setName(t("DISABLE_FILE_MENU_REVIEW_OPTIONS"))
            .setDesc(t("DISABLE_FILE_MENU_REVIEW_OPTIONS_DESC"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.data.settings.disableFileMenuReviewOptions)
                    .onChange(async (value) => {
                        this.plugin.data.settings.disableFileMenuReviewOptions = value;
                        await this.plugin.savePluginData();
                    }),
            );

        new Setting(containerEl)
            .setName(t("MAX_N_DAYS_REVIEW_QUEUE"))
            .addText((text) =>
                text
                    .setValue(this.plugin.data.settings.maxNDaysNotesReviewQueue.toString())
                    .onChange((value) => {
                        applySettingsUpdate(async () => {
                            const numValue: number = Number.parseInt(value);
                            if (!isNaN(numValue)) {
                                if (numValue < 1) {
                                    new Notice(t("MIN_ONE_DAY"));
                                    text.setValue(
                                        this.plugin.data.settings.maxNDaysNotesReviewQueue.toString(),
                                    );
                                    return;
                                }

                                this.plugin.data.settings.maxNDaysNotesReviewQueue = numValue;
                                await this.plugin.savePluginData();
                            } else {
                                new Notice(t("VALID_NUMBER_WARNING"));
                            }
                        });
                    }),
            )
            .addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip(t("RESET_DEFAULT"))
                    .onClick(async () => {
                        this.plugin.data.settings.maxNDaysNotesReviewQueue =
                            DEFAULT_SETTINGS.maxNDaysNotesReviewQueue;
                        await this.plugin.savePluginData();
                        this.display();
                    });
            });

        containerEl.createEl("h3", { text: `${t("UI_PREFERENCES")}` });

        new Setting(containerEl)
            .setName(t("INITIALLY_EXPAND_SUBDECKS_IN_TREE"))
            .setDesc(t("INITIALLY_EXPAND_SUBDECKS_IN_TREE_DESC"))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.data.settings.initiallyExpandAllSubdecksInTree)
                    .onChange(async (value) => {
                        this.plugin.data.settings.initiallyExpandAllSubdecksInTree = value;
                        await this.plugin.savePluginData();
                    }),
            );

        this.addResponseButtonTextSetting(containerEl);

        containerEl.createEl("h3", { text: `${t("ALGORITHM")}` });

        this.addAlgorithmSpecificDisplaySetting(containerEl);

        containerEl.createEl("h3", { text: `${t("LOGGING")}` });
        new Setting(containerEl).setName(t("DISPLAY_DEBUG_INFO")).addToggle((toggle) =>
            toggle.setValue(this.plugin.data.settings.showDebugMessages).onChange(async (value) => {
                this.plugin.data.settings.showDebugMessages = value;
                if (value) {
                    this.plugin.commands.addDebugCommands();
                }
                await this.plugin.savePluginData();
            }),
        );

        buildDonation(this.containerEl);
    }

    addDataLocationSettings(containerEl: HTMLElement) {
        const plugin = this.plugin;
        const settings = plugin.data.settings;
        const locSwitch = new LocationSwitch(plugin, settings);
        const desc_toNote =
            "BE CAREFUL!!!\n  if you confirm this, it will convert \
        all your scheduling informations in `tracked_files.json` to note,\
        which will change lots of your note file in the same time.\n\
        Please make sure the setting tags of flashcards and notes is what you are using.\n";
        const desc_toNote_otherAlgo =
            "if you want to save data on notefile, you **have to** use Default Algorithm.\n";
        const desc_toTrackedFiles =
            "BE CAREFUL!!! \n if you confirm this, it will converte \
        all your scheduling informations on note(which will be deleted in the same time) TO `tracked_files.json`.\n";

        new Setting(containerEl)
            .setName(t("DATA_LOC"))
            .setDesc(t("DATA_LOC_DESC"))
            .addDropdown((dropdown) => {
                Object.values(DataLocation).forEach((val) => {
                    dropdown.addOption(val, val);
                });
                dropdown.setValue(plugin.data.settings.dataLocation);

                dropdown.onChange(async (val) => {
                    const loc = locationMap[val];
                    await plugin.sync();
                    const noteStats = deepcopy(plugin.noteStats);
                    const cardStats = deepcopy(plugin.cardStats);

                    let confirmP: Promise<boolean>;
                    // const moveP = new Promise(function (resolve) {
                    if (loc === DataLocation.SaveOnNoteFile) {
                        if (settings.algorithm === algorithmNames.Default) {
                            await locSwitch.converteTrackfileToNoteSched(true);
                            confirmP = new Promise(function (resolve) {
                                new ConfirmModal(
                                    plugin,
                                    desc_toNote +
                                        "### review Notes\n" +
                                        locSwitch.createTable(noteStats, plugin.noteStats) +
                                        "\n---\n### flashcards\n" +
                                        locSwitch.createTable(cardStats, plugin.cardStats),
                                    async (confirm) => {
                                        if (confirm) {
                                            await locSwitch.converteTrackfileToNoteSched();
                                            plugin.data.settings.dataLocation = loc;
                                            locSwitch.moveStoreLocation();
                                            plugin.data.settings.customFolder =
                                                locSwitch.getStorePath();

                                            resolve(true);
                                        }
                                    },
                                ).open();
                            });
                        } else {
                            new ConfirmModal(plugin, desc_toNote_otherAlgo, () => {
                                dropdown.setValue(plugin.data.settings.dataLocation);
                            }).open();
                        }
                    } else if (settings.dataLocation === DataLocation.SaveOnNoteFile) {
                        await locSwitch.converteNoteSchedToTrackfile(true, loc);
                        confirmP = new Promise(function (resolve) {
                            new ConfirmModal(
                                plugin,
                                desc_toTrackedFiles +
                                    "### review Notes\n" +
                                    locSwitch.createTable(noteStats, plugin.noteStats) +
                                    "\n---\n### flashcards\n" +
                                    locSwitch.createTable(cardStats, plugin.cardStats),
                                async (confirm) => {
                                    if (confirm) {
                                        await plugin.sync();
                                        plugin.data.settings.dataLocation = loc;
                                        await locSwitch.moveStoreLocation();
                                        plugin.data.settings.customFolder =
                                            locSwitch.getStorePath();
                                        await locSwitch.converteNoteSchedToTrackfile();

                                        resolve(true);
                                    }
                                },
                            ).open();
                        });
                    } else {
                        plugin.data.settings.dataLocation = loc;
                        await locSwitch.moveStoreLocation();
                        plugin.data.settings.customFolder = locSwitch.getStorePath();

                        // resolve(true);
                    }
                    dropdown.setValue(plugin.data.settings.dataLocation);
                    // });
                    // if (Promise.resolve(moveP)) {
                    if (await confirmP) {
                        dropdown.setValue(plugin.data.settings.dataLocation);
                        // plugin.savePluginData();
                        await plugin.savePluginData();
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore
                        await this.app.plugins.disablePlugin(plugin.manifest.id);
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore
                        await this.app.plugins.enablePlugin(plugin.manifest.id);
                        console.debug("finish location change.");

                        await plugin.sync();

                        if (
                            locSwitch.compare(noteStats, plugin.noteStats, "note") ||
                            locSwitch.compare(cardStats, plugin.cardStats, "card")
                        ) {
                            console.log(
                                "before chang noteStats, cardStats:\n",
                                noteStats,
                                cardStats,
                                "\nafter change:\n",
                                plugin.noteStats,
                                plugin.cardStats,
                            );
                            new Notice("have some data lost, see console for detials.");
                        }
                        // this.display();
                    }
                });
            });
    }

    addSpecifiedFolderSetting(containerEl: HTMLElement) {
        const plugin = this.plugin;
        const settings = plugin.data.settings;
        const locSwitch = new LocationSwitch(plugin, settings);
        const fder_index = plugin.data.settings.customFolder.lastIndexOf("/");
        let cusFolder = plugin.data.settings.customFolder.substring(0, fder_index);
        const cusFilename = plugin.data.settings.customFolder.substring(fder_index + 1);

        new Setting(containerEl)
            .setName(t("DATA_FOLDER"))
            // .setDesc('Folder for `tracked_files.json`')
            .addSearch((cb) => {
                new FolderSuggest(cb.inputEl);
                cb.setPlaceholder("Example: folder1/folder2")
                    .setValue(cusFolder)
                    .onChange((new_folder) => {
                        cusFolder = new_folder;
                        cb.setValue(cusFolder);
                    });
            })
            .addButton((btn) =>
                btn
                    .setButtonText("save")
                    .setCta()
                    .onClick(async () => {
                        plugin.data.settings.customFolder = cusFolder + "/" + cusFilename;
                        await locSwitch.moveStoreLocation();
                        await plugin.savePluginData();
                        this.display();
                    }),
            );
    }

    addNewPerDaySetting(containerEl: HTMLElement) {
        const plugin = this.plugin;

        new Setting(containerEl)
            .setName(t("NEW_PER_DAY"))
            .setDesc(t("NEW_PER_DAY_DESC"))
            .addText((text) =>
                text
                    .setPlaceholder("New Per Day")
                    .setValue(plugin.data.settings.maxNewPerDay.toString())
                    .onChange((newValue) => {
                        const newPerDay = Number(newValue);

                        if (isNaN(newPerDay)) {
                            new Notice(t("NEW_PER_DAY_NAN"));
                            return;
                        }

                        if (newPerDay < -1) {
                            new Notice(t("NEW_PER_DAY_NEG"));
                            return;
                        }

                        plugin.data.settings.maxNewPerDay = newPerDay;
                        plugin.savePluginData();
                    }),
            );
    }

    addRepeatItemsSetting(containerEl: HTMLElement) {
        const plugin = this.plugin;
        new Setting(containerEl)
            .setName(t("REPEAT_ITEMS"))
            .setDesc(t("REPEAT_ITEMS_DESC"))
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.data.settings.repeatItems);
                toggle.onChange((value) => {
                    plugin.data.settings.repeatItems = value;
                    plugin.savePluginData();
                });
            });
    }

    addAlgorithmSetting(containerEl: HTMLElement) {
        const plugin = this.plugin;
        const settings = plugin.data.settings;

        new Setting(containerEl)
            .setName(t("ALGORITHM"))
            .addDropdown((dropdown) => {
                Object.keys(algorithms).forEach((val) => {
                    dropdown.addOption(val, val);
                });
                const oldAlgo = plugin.data.settings.algorithm as algorithmNames;
                dropdown.setValue(plugin.data.settings.algorithm);
                dropdown.onChange((newValue) => {
                    if (
                        settings.dataLocation === DataLocation.SaveOnNoteFile &&
                        newValue !== algorithmNames.Default
                    ) {
                        new ConfirmModal(
                            plugin,
                            "if you want to use " +
                                newValue +
                                " Algorithm, you **can't ** save data on notefile.",
                            () => {
                                dropdown.setValue(plugin.data.settings.algorithm);
                            },
                        ).open();
                        return;
                    }
                    new ConfirmModal(plugin, t("ALGORITHMS_CONFIRM"), async (confirmed) => {
                        if (confirmed) {
                            const result = await algorithmSwitchData(
                                plugin,
                                oldAlgo,
                                newValue as algorithmNames,
                            );
                            if (!result) {
                                dropdown.setValue(plugin.data.settings.algorithm);
                                return;
                            }

                            plugin.data.settings.algorithm = newValue;
                            plugin.algorithm = algorithms[plugin.data.settings.algorithm];
                            plugin.algorithm.updateSettings(
                                plugin,
                                plugin.data.settings.algorithmSettings[newValue],
                            );
                            await plugin.savePluginData();
                            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                            // @ts-ignore
                            await this.app.plugins.disablePlugin(plugin.manifest.id);
                            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                            // @ts-ignore
                            await this.app.plugins.enablePlugin(plugin.manifest.id);
                            // this.app.setting.openTabById(plugin.manifest.id);

                            this.display();
                        } else {
                            dropdown.setValue(plugin.data.settings.algorithm);
                        }
                    }).open();
                });
            })
            .settingEl.querySelector(".setting-item-description").innerHTML = t("ALGORITHMS_DESC");
    }

    addAlgorithmSpecificDisplaySetting(containerEl: HTMLElement) {
        const plugin = this.plugin;

        plugin.algorithm.displaySettings(containerEl, (settings: unknown) => {
            plugin.data.settings.algorithmSettings[plugin.data.settings.algorithm] = settings;
            plugin.savePluginData();
            // this.display(); // 容易导致失去输入焦点
        });
    }

    addTrackedNoteToDecksSetting(containerEl: HTMLElement) {
        const plugin = this.plugin;

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

    addReviewResponseFloatBarSetting(containerEl: HTMLElement) {
        const plugin = this.plugin;

        new Setting(containerEl)
            .setName(t("REVIEW_FLOATBAR"))
            .setDesc(t("REVIEW_FLOATBAR_DESC"))
            .addToggle((toggle) => {
                toggle
                    .setValue(plugin.data.settings.reviewResponseFloatBar)
                    .onChange((newValue) => {
                        plugin.data.settings.reviewResponseFloatBar = newValue;
                        plugin.savePluginData();
                    });
            });
    }

    addIntervalShowHideSetting(containerEl: HTMLElement) {
        const plugin = this.plugin;

        new Setting(containerEl)
            .setName(t("INTERVAL_SHOWHIDE"))
            .setDesc(t("INTERVAL_SHOWHIDE_DESC"))
            .addToggle((toggle) => {
                toggle.setValue(plugin.data.settings.intervalShowHide).onChange((newValue) => {
                    plugin.data.settings.intervalShowHide = newValue;
                    plugin.savePluginData();
                });
            });
    }

    addReviewNoteDirectlySetting(containerEl: HTMLElement) {
        const plugin = this.plugin;

        new Setting(containerEl)
            .setName(t("REVIEW_NOTE_DIRECTLY"))
            .setDesc(t("REVIEW_NOTE_DIRECTLY_DESC"))
            .addToggle((toggle) => {
                toggle.setValue(plugin.data.settings.reviewingNoteDirectly).onChange((newValue) => {
                    plugin.data.settings.reviewingNoteDirectly = newValue;
                    plugin.savePluginData();
                });
            });
    }

    addResponseButtonTextSetting(containerEl: HTMLElement) {
        const plugin = this.plugin;
        const options = plugin.algorithm.srsOptions();
        const settings = plugin.data.settings;
        const algo = settings.algorithm;
        const btnText = settings.responseOptionBtnsText;

        if (btnText[algo] == null) {
            btnText[algo] = [];
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            options.forEach((opt, ind) => (btnText[algo][ind] = t(opt.toUpperCase())));
        }
        options.forEach((opt, ind) => {
            const btnTextEl = new Setting(containerEl)
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                .setName(t("FLASHCARD_" + opt.toUpperCase() + "_LABEL"))
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                .setDesc(t("FLASHCARD_" + opt.toUpperCase() + "_DESC"));
            btnTextEl.addText((text) =>
                text.setValue(btnText[algo][ind]).onChange((value) => {
                    applySettingsUpdate(() => {
                        btnText[algo][ind] = value;
                        this.plugin.savePluginData();
                    });
                }),
            );
            btnTextEl.addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip(t("RESET_DEFAULT"))
                    .onClick(() => {
                        settings.responseOptionBtnsText[algo][ind] =
                            DEFAULT_SETTINGS.responseOptionBtnsText[algo][ind];
                        this.plugin.savePluginData();
                        this.display();
                    });
            });
        });
    }
}
export function buildDonation(containerEl: HTMLElement): void {
    const div = containerEl.createEl("div");
    const hr: HTMLElement = document.createElement("hr");
    div.appendChild(hr);
    div.style.width = "75%";
    div.style.textAlign = "center";
    div.style.margin = "0 auto";

    const text = document.createElement("p");
    // text.textContent = t("COFFEE");
    text.textContent = "业余时间折腾的，如果对你有所帮助，可以请我喝瓶饮料或奶茶呀~";
    div.appendChild(text);

    let anchor = document.createElement("a");
    const image = new Image();
    image.src = QR_alipay;
    image.width = 130;
    anchor.appendChild(image);
    div.appendChild(anchor);

    const image2 = new Image();
    image2.src = QR_wechat;
    image2.width = 130;
    anchor = document.createElement("a");
    anchor.appendChild(image2);
    div.appendChild(anchor);
}
export { algorithms };
