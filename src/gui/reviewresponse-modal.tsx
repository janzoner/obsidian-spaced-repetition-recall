// https://img.shields.io/github/v/release/chetachiezikeuzor/cMenu-Plugin
import { MarkdownView, Menu, MenuItem, Platform, TFile } from "obsidian";
import { textInterval } from "src/scheduling";
import { SRSettings } from "src/settings";
import { t } from "src/lang/helpers";
// import { FlashcardModalMode } from "src/gui/flashcard-modal";
import { SrsAlgorithm } from "src/algorithms/algorithms";
import { RepetitionItem } from "src/dataStore/repetitionItem";
// import { debug } from "src/util/utils_recall";
import { TouchOnMobile } from "src/Events/touchEvent";

export class reviewResponseModal {
    private static instance: reviewResponseModal;
    // public plugin: SRPlugin;
    private settings: SRSettings;
    public submitCallback: (note: TFile, resp: number) => void;
    private algorithm: SrsAlgorithm;
    private containerEl: HTMLElement;
    private contentEl: HTMLElement;

    barId = "reviewResponseModalBar";
    private barItemId: string = "ResponseFloatBarCommandItem";
    // mode: FlashcardModalMode;
    private answerBtn: HTMLElement;
    private buttons: HTMLButtonElement[];
    private responseDiv: HTMLElement;
    private responseInterval: number[];
    private showInterval = true;
    private buttonTexts: string[];
    private options: string[];

    respCallback: (s: string) => void;

    static getInstance() {
        return reviewResponseModal.instance;
    }

    constructor(settings: SRSettings) {
        this.settings = settings;
        const algo = settings.algorithm;
        this.buttonTexts = settings.responseOptionBtnsText[algo];
        this.algorithm = SrsAlgorithm.getInstance();
        this.options = this.algorithm.srsOptions();
        reviewResponseModal.instance = this;
    }

    public display(
        item?: RepetitionItem,
        callback?: (opt: string) => void,
        // mode?: FlashcardModalMode,
    ): void {
        const settings = this.settings;
        // this.mode = mode;

        if (!settings.reviewResponseFloatBar || !settings.autoNextNote) return;
        if (item) {
            this.responseInterval = this.algorithm.calcAllOptsIntervals(item);
        } else {
            this.responseInterval = null;
        }
        const rrBar = document.getElementById(this.barId);
        if (!rrBar || !this.buttons) {
            this.build();
        }

        this.respCallback = callback;

        // update show text
        // if (this.mode == null || this.mode == FlashcardModalMode.Front) {
        this.showAnswer();
        // } else if (this.mode == FlashcardModalMode.Back) {
        //     this.showQuestion();
        // }
    }

    private build() {
        // const options = this.plugin.algorithm.srsOptions();
        const optBtnCounts = this.options.length;
        let btnCols = 4;
        if (!Platform.isMobile && optBtnCounts > btnCols) {
            btnCols = optBtnCounts;
        }
        this.containerEl = createEl("div");
        this.containerEl.setAttribute("id", this.barId);
        this.containerEl.addClass("ResponseFloatBarDefaultAesthetic");
        // this.containerEl.setAttribute("style", `grid-template-columns: ${"1fr ".repeat(btnCols)}`);
        this.containerEl.setAttribute("style", `grid-template-rows: ${"1fr ".repeat(1)}`);
        this.containerEl.style.visibility = "visible"; // : "hidden"
        document.body
            .querySelector(".mod-vertical.mod-root")
            .insertAdjacentElement("afterbegin", this.containerEl);

        this.contentEl = this.containerEl.createDiv("sr-show-response");
        this.responseDiv = this.contentEl.createDiv("sr-flashcard-response");
        this.responseDiv.setAttribute("style", `grid-template-columns: ${"1fr ".repeat(btnCols)}`);

        this.buttons = [];
        this.createButtons_responses();
        // this.responseDiv.style.display = "none";

        this.createButton_showAnswer();

        this.addMenuEvent();
        this.addKeysEvent();
        this.addTouchEvent();
        this.autoClose();
    }

    private buttonClick(s: string) {
        // this.mode = FlashcardModalMode.Front;

        if (this.respCallback) {
            this.respCallback(s);
            return;
        }

        const openFile: TFile | null = app.workspace.getActiveFile();
        if (openFile && openFile.extension === "md") {
            if (this.submitCallback) {
                this.submitCallback(openFile, this.options.indexOf(s));
            }
        }
    }

    private createButtons_responses() {
        this.options.forEach((opt: string, index) => {
            const btn = document.createElement("button");
            btn.setAttribute("id", "sr-" + opt.toLowerCase() + "-btn");
            btn.setAttribute("class", this.barItemId);
            // btn.setAttribute("aria-label", "Hotkey: " + (index + 1));
            // btn.setAttribute("style", `width: calc(95%/${buttonCounts});`);
            // setIcon(btn, item.icon);
            // let text = btnText[algo][index];
            const text = this.getTextWithInterval(index);
            btn.setText(text);
            btn.addEventListener("click", () => this.buttonClick(opt));
            this.buttons.push(btn);
            this.responseDiv.appendChild(btn);
        });
    }

    private createButton_showAnswer() {
        this.answerBtn = this.contentEl.createDiv();
        this.answerBtn.setAttribute("id", "sr-show-answer");
        this.answerBtn.setText(t("SHOW_ANSWER"));
        this.answerBtn.addEventListener("click", () => {
            this.showAnswer();
        });
        // this.answerBtn.style.display = "block";
    }

    private addMenuEvent() {
        this.containerEl.addEventListener("mouseup", showCloseMenuCB);
        const showcb = () => {
            this.toggleShowInterval();
            this.showAnswer();
        };
        const closecb = () => {
            this.selfDestruct();
        };
        const menu = new Menu();
        let showitem: MenuItem;
        const isShow = () => this.showInterval;

        menu.addItem((item) => {
            showitem = item;
            item.onClick(showcb);
        });

        menu.addItem((item) => {
            item.setIcon("lucide-x");
            item.setTitle("Close");
            item.onClick(closecb);
        });
        function showCloseMenuCB(evt: MouseEvent) {
            evt.cancelable && evt.preventDefault();
            if (isShow()) {
                showitem.setIcon("alarm-clock-off");
                showitem.setTitle("Hide Intervals");
            } else {
                showitem.setIcon("alarm-clock");
                showitem.setTitle("Show Intervals");
            }
            if (typeof evt === "object") {
                if (evt.button === 2) {
                    // right-click
                    menu.showAtMouseEvent(evt);
                }
            }
        }
    }
    private addTouchEvent() {
        if (!Platform.isMobile) {
            return;
        }
        const touch = TouchOnMobile.create();
        touch.showcb = () => {
            this.toggleShowInterval();
            this.showAnswer();
        };
        touch.closecb = () => {
            this.selfDestruct();
        };

        this.containerEl.addEventListener("touchstart", touch.handleStart.bind(touch), {
            passive: true,
        });
        this.containerEl.addEventListener("touchmove", touch.handleMove.bind(touch), {
            passive: true,
        });
        this.containerEl.addEventListener("touchend", touch.handleEnd.bind(touch), {
            passive: false,
        });
    }

    private addKeysEvent() {
        const bar = document.getElementById(this.barId);
        // const Markdown = app.workspace.getActiveViewOfType(MarkdownView);

        document.body.onkeydown = (e) => {
            if (
                bar &&
                bar.checkVisibility() &&
                this.isDisplay() &&
                app.workspace.getActiveViewOfType(MarkdownView).getMode() === "preview"
            ) {
                const consume = () => {
                    e.preventDefault();
                    e.stopPropagation();
                };
                this.options.map((_opt, idx) => {
                    const num = "Numpad" + idx;
                    const dig = "Digit" + idx;
                    if (e.code === num || e.code === dig) {
                        this.buttonClick(this.options[idx]);
                        consume();
                    }
                });
            }
        };
    }

    private toggleShowInterval() {
        this.showInterval = this.showInterval ? false : true;
    }

    private showAnswer() {
        // this.mode = FlashcardModalMode.Back;

        this.answerBtn.style.display = "none";
        this.responseDiv.style.display = "grid";

        this.options.forEach((opt, index) => {
            const btn = document.getElementById("sr-" + opt.toLowerCase() + "-btn");
            // let text = btnText[algo][index];
            const text = this.getTextWithInterval(index);
            btn.setText(text);
        });
    }

    private showQuestion() {
        // this.mode = FlashcardModalMode.Front;

        this.answerBtn.style.display = "block";
        this.responseDiv.style.display = "none";
        // this.responseDiv.toggleVisibility(false);       //还是会占位
    }

    private getTextWithInterval(index: number) {
        let text = this.buttonTexts[index];
        if (this.showInterval) {
            text =
                this.responseInterval == null
                    ? `${text}`
                    : Platform.isMobile
                      ? textInterval(this.responseInterval[index], true)
                      : `${text} - ${textInterval(this.responseInterval[index], false)}`;
        }
        return text;
    }

    public isDisplay() {
        return document.getElementById(this.barId) != null;
        // return this.containerEl.style.visibility === "visible";
    }

    selfDestruct() {
        const rrBar = document.getElementById(this.barId);
        if (rrBar) {
            rrBar.style.visibility = "hidden";
            if (rrBar.firstChild) {
                rrBar.removeChild(rrBar.firstChild);
            }
            rrBar.remove();
        }
    }

    private autoClose() {
        //after review
        const tout = Platform.isMobile ? 5000 : 10000;
        const timmer = setInterval(() => {
            const rrBar = document.getElementById(this.barId);
            const Markdown = app.workspace.getActiveViewOfType(MarkdownView);
            if (rrBar) {
                if (!Markdown) {
                    this.selfDestruct();
                    clearInterval(timmer);
                }
            }
        }, tout);
    }
}
