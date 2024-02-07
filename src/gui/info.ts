import { ButtonComponent, Modal, Setting, TFile } from "obsidian";
import { algorithmNames } from "src/algorithms/algorithms";
import { AnkiData } from "src/algorithms/anki";
import { FsrsData } from "src/algorithms/fsrs";
import { DataStore } from "src/dataStore/data";
import { RepetitionItem } from "src/dataStore/repetitionItem";
import { SRSettings } from "src/settings";

export class ItemInfoModal extends Modal {
    // plugin: ObsidianSrsPlugin;
    store: DataStore;
    settings: SRSettings;
    file: TFile;
    item: RepetitionItem;
    nextReview: number;
    lastInterval: number;

    constructor(settings: SRSettings, file: TFile, item: RepetitionItem = null) {
        super(app);
        // this.plugin = plugin;
        this.store = DataStore.getInstance();
        this.settings = settings;
        this.file = file;
        if (item == null) {
            this.item = this.store.getItemsOfFile(this.file.path)[0];
        } else {
            this.item = item;
        }
    }

    onOpen() {
        const { contentEl } = this;
        //TODO: Implement Item info.
        // const item = this.store.getItemsOfFile(this.file.path)[0];
        // const path = this.store.getFilePath(item);
        // contentEl.createEl("p").setText("Item info of " + this.file.path);
        const buttonDivAll = contentEl.createDiv("srs-flex-row");
        const contentdiv = contentEl.createEl("div");

        this.displayitem(contentdiv, this.item);

        // new ButtonComponent(buttonDivAll).setButtonText("Current").onClick(() => {
        //     this.displayitem(contentdiv, item);
        // });
        // new ButtonComponent(buttonDivAll).setButtonText("All").onClick(() => {
        //     this.displayAllitems(contentdiv, this.store.data.items);
        //     // this.close();
        // });

        const buttonDiv = contentEl.createDiv("srs-flex-row");

        new ButtonComponent(buttonDiv)
            .setButtonText("Save")
            .setTooltip("only save current note's item info")
            .onClick(() => {
                this.submit();
                this.close();
            });
        new ButtonComponent(buttonDiv).setButtonText("Close").onClick(() => {
            // this.callback(false);
            this.close();
        });
    }

    displayAllitems(contentEl: HTMLElement, items: RepetitionItem[]) {
        contentEl.empty();
        items.forEach((item) => {
            this.displayitemWithSummary(contentEl, item);
        });
    }

    displayitemWithSummary(contentEl: HTMLElement, item: RepetitionItem) {
        const details = contentEl.createEl("details");
        const summary = details.createEl("summary");
        const div = details.createDiv();

        // const plugin = this.plugin;
        const path = this.store.getFilePath(item);
        // details.createEl("p").setText("Item info of "+path);
        summary.setText(path);

        this.displayitem(div, item);
    }

    displayitem(contentEl: HTMLElement, item: RepetitionItem) {
        const path = this.store.getFilePath(item);
        contentEl.empty();
        contentEl.createEl("p").setText("Item info of " + path);
        const contentdiv = contentEl.createEl("div");

        console.debug("item: ", item);
        // Object.keys(item).forEach(key => {
        //     contentEl.createDiv("li").setText(key+ ": "+ item[key])
        // });
        // type dataType = typeof plugin.algorithm.defaultData;
        Object.keys(item).forEach((key) => {
            if (key != "data") {
                new Setting(contentdiv).setDesc(key).addText((text) => {
                    if (key === "nextReview") {
                        this.nextReview = undefined;
                        const dt = window.moment(item.nextReview).format("YYYY-MM-DD HH:mm:ss");
                        text.setValue(dt).onChange((value) => {
                            const nr = window.moment(value).valueOf();
                            this.nextReview = nr ?? 0;
                        });
                    } else {
                        text.setDisabled(true);
                        text.setValue(item[key as keyof typeof item]?.toString());
                    }
                });
            }
        });
        contentdiv.createEl("p").setText("Item.data info");

        const data = item.data as AnkiData;
        Object.keys(item.data).forEach((key) => {
            new Setting(contentdiv).setDesc(key).addText((text) => {
                key = key as keyof typeof item.data;
                if (key === "lastInterval") {
                    this.lastInterval = undefined;
                    text.setValue(data[key]?.toString()).onChange((value) => {
                        this.lastInterval = Number(value) ?? 0;
                    });
                } else {
                    text.setDisabled(true);
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    text.setValue(data[key]?.toString());
                }
            });
        });
    }

    submit() {
        const item = this.item;
        console.debug(this);
        const algo = this.settings.algorithm;
        if (this.nextReview) {
            const nr = window.moment(this.nextReview).valueOf();
            this.nextReview = nr ?? 0;
            item.nextReview = this.nextReview > 0 ? this.nextReview : item.nextReview;
            if (algo === algorithmNames.Fsrs) {
                const data = item.data as FsrsData;
                data.due = new Date(item.nextReview);
            }
        }
        // item.nextReview= this.nextReview?this.nextReview:item.nextReview;
        if (algo !== algorithmNames.Fsrs) {
            const data = item.data as AnkiData;
            data.lastInterval = this.lastInterval ? this.lastInterval : data.lastInterval;
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
