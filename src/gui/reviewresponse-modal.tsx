// https://img.shields.io/github/v/release/chetachiezikeuzor/cMenu-Plugin
import { MarkdownView, Platform, TFile, setIcon } from "obsidian";
import { textInterval } from "src/scheduling";
import { SRSettings } from "src/settings";
import { t } from "src/lang/helpers";
// import { FlashcardModalMode } from "src/gui/flashcard-modal";
import SrsAlgorithm from "src/algorithms/algorithms";
import { RepetitionItem } from "src/dataStore/repetitionItem";

export class reviewResponseModal {
    private static instance: reviewResponseModal;
    // public plugin: SRPlugin;
    public settings: SRSettings;
    public submitCallback: (note: TFile, resp: number) => void;
    private algorithm: SrsAlgorithm;
    containerEl: HTMLElement;
    contentEl: HTMLElement;

    id = "reviewResponseModalBar";
    // mode: FlashcardModalMode;
    public answerBtn: HTMLElement;
    buttons: HTMLButtonElement[];
    responseDiv: HTMLElement;
    responseInterval: number[];
    showInterval = true;
    buttonTexts: string[];
    options: string[];

    static getInstance() {
        return reviewResponseModal.instance;
    }

    constructor(settings: SRSettings, options: string[]) {
        this.settings = settings;
        const algo = settings.algorithm;
        this.buttonTexts = settings.responseOptionBtnsText[algo];
        this.options = options;
        this.algorithm = SrsAlgorithm.getInstance();
        reviewResponseModal.instance = this;
        // this.display(show, responseInterval);
    }

    public algoDisplay(
        show = true,
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
        const reviewResponseModalBar = document.getElementById(this.id);
        if (!show) {
            this.selfDestruct();
            return;
        } else if (!reviewResponseModalBar) {
            const buttonClick = (s: string) => {
                // this.mode = FlashcardModalMode.Front;

                if (callback) {
                    callback(s);
                    return;
                }

                const openFile: TFile | null = app.workspace.getActiveFile();
                if (openFile && openFile.extension === "md") {
                    if (this.submitCallback) {
                        this.submitCallback(openFile, this.options.indexOf(s));
                    }
                }
            };

            this.build(buttonClick);
        }

        // update show text
        // if (this.mode == null || this.mode == FlashcardModalMode.Front) {
        this.showAnswer();
        // } else if (this.mode == FlashcardModalMode.Back) {
        //     this.showQuestion();
        // }

        /* const bar = document.getElementById("reviewResponseModalBar");
        const Markdown = app.workspace.getActiveViewOfType(MarkdownView);

        document.body.onkeydown = (e) => {
            if (
                bar &&
                bar.checkVisibility &&
                (Markdown.getMode() === "preview" ||
                    document.activeElement.hasClass("ResponseFloatBarCommandItem"))
            ) {
                const consume = () => {
                    e.preventDefault();
                    e.stopPropagation();
                };
                for (let i = 0; i < options.length; i++) {
                    const num = "Numpad" + i;
                    const dig = "Digit" + i;
                    if (e.code === num || e.code === dig) {
                        buttonClick(options[0]);
                        break;
                    }
                }
                consume();
            }
        };
 */
    }

    private build(buttonClick: (opt: string) => void) {
        // const options = this.plugin.algorithm.srsOptions();
        const optBtnCounts = this.options.length;
        let btnCols = 4;
        if (!Platform.isMobile && optBtnCounts > btnCols) {
            btnCols = optBtnCounts;
        }
        this.containerEl = createEl("div");
        this.containerEl.setAttribute("id", this.id);
        this.containerEl.addClass("ResponseFloatBarDefaultAesthetic");
        // this.containerEl.setAttribute("style", `grid-template-columns: ${"1fr ".repeat(btnCols)}`);
        this.containerEl.setAttribute("style", `grid-template-rows: ${"1fr ".repeat(2)}`);
        this.containerEl.style.visibility = "visible"; // : "hidden"
        document.body
            .querySelector(".mod-vertical.mod-root")
            .insertAdjacentElement("afterbegin", this.containerEl);

        this.contentEl = this.containerEl.createDiv("sr-show-response");
        this.responseDiv = this.contentEl.createDiv("sr-flashcard-response");
        this.responseDiv.setAttribute("style", `grid-template-columns: ${"1fr ".repeat(btnCols)}`);

        this.buttons = [];
        this.options.forEach((opt: string, index) => {
            const btn = document.createElement("button");
            btn.setAttribute("id", "sr-" + opt.toLowerCase() + "-btn");
            btn.setAttribute("class", "ResponseFloatBarCommandItem");
            // btn.setAttribute("aria-label", "Hotkey: " + (index + 1));
            // btn.setAttribute("style", `width: calc(95%/${buttonCounts});`);
            // setIcon(btn, item.icon);
            // let text = btnText[algo][index];
            const text = this.getTextWithInterval(index);
            btn.setText(text);
            btn.addEventListener("click", () => buttonClick(opt));
            this.buttons.push(btn);
            this.responseDiv.appendChild(btn);
        });
        // this.responseDiv.style.display = "none";

        this.answerBtn = this.contentEl.createDiv();
        this.answerBtn.setAttribute("id", "sr-show-answer");
        this.answerBtn.setText(t("SHOW_ANSWER"));
        this.answerBtn.addEventListener("click", () => {
            this.showAnswer();
        });
        // this.answerBtn.style.display = "block";

        const showCloseDiv = this.containerEl.createDiv("sr-show-close");
        showCloseDiv.setAttribute("style", "display: flex; width: 64px"); // position:relative;

        const showIntvlBtn = document.createElement("button");
        const showcb = () => {
            if (this.showInterval) {
                this.showInterval = false;
                setIcon(showIntvlBtn, "alarm-clock-off");
            } else {
                this.showInterval = true;
                setIcon(showIntvlBtn, "alarm-clock");
            }
            this.showAnswer();
        };
        addButton_showInterval(this, showIntvlBtn, showcb);
        this.buttons.push(showIntvlBtn);
        // this.containerEl.appendChild(showIntvlBtn);
        showCloseDiv.appendChild(showIntvlBtn);

        const closeBtn = document.createElement("button");
        addButton_close(this, closeBtn);
        this.buttons.push(closeBtn);
        this.containerEl.appendChild(closeBtn);
        showCloseDiv.appendChild(closeBtn);
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
        return document.getElementById(this.id) != null;
        // return this.containerEl.style.visibility === "visible";
    }

    selfDestruct() {
        const reviewResponseModalBar = document.getElementById(this.id);
        if (reviewResponseModalBar) {
            reviewResponseModalBar.style.visibility = "hidden";
            if (reviewResponseModalBar.firstChild) {
                reviewResponseModalBar.removeChild(reviewResponseModalBar.firstChild);
            }
            reviewResponseModalBar.remove();
        }
    }

    autoClose() {
        //after review
        const timmer = setInterval(() => {
            const reviewResponseModalBar = document.getElementById(this.id);
            const Markdown = app.workspace.getActiveViewOfType(MarkdownView);
            if (reviewResponseModalBar) {
                if (!Markdown) {
                    reviewResponseModalBar.style.visibility = "hidden";
                    this.selfDestruct();
                    clearInterval(timmer);
                }
            }
        }, 10000);
    }
}

function addButton_showInterval(
    rrBar: reviewResponseModal,
    showIntvlBtn: HTMLElement,
    showCb: () => void,
) {
    showIntvlBtn.setAttribute("id", "sr-showintvl-btn");
    showIntvlBtn.setAttribute("class", "ResponseFloatBarCommandItem");
    showIntvlBtn.setAttribute(
        "aria-label",
        "时间间隔显隐,\n建议：复习类不显示，渐进总结/增量写作显示",
    );
    // showIntvlBtn.setText("Show");
    setIcon(showIntvlBtn, "alarm-clock");
    showIntvlBtn.addEventListener("click", showCb);
}

function addButton_close(rrBar: reviewResponseModal, closeBtn: HTMLElement) {
    closeBtn.setAttribute("id", "sr-close-btn");
    closeBtn.setAttribute("class", "ResponseFloatBarCommandItem");
    closeBtn.setAttribute("aria-label", "关闭浮栏显示");
    // closeBtn.setAttribute("style", `width: calc(95%/${buttonCounts});`);
    // setIcon(closeBtn, "lucide-x");
    closeBtn.setText("X");
    closeBtn.addEventListener("click", () => {
        rrBar.containerEl.style.visibility = "hidden";
        rrBar.selfDestruct();
    });
}
