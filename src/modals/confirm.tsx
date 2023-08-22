import { App, Modal, ButtonComponent } from "obsidian";

type ConfirmCallback = (confirmed: boolean) => void;

export default class ConfirmModal {
    message: string;
    callback: ConfirmCallback;
    modal: Modal;

    constructor(app: App, message: string, callback: ConfirmCallback) {
        // super(app);
        this.message = message;
        this.modal = new Modal(app);
        this.callback = callback;
    }

    open() {
        const { contentEl } = this.modal;

        contentEl.createEl("p").setText(this.message);

        const buttonDiv = contentEl.createDiv("srs-flex-row");
        buttonDiv.setAttribute("align", "center");

        new ButtonComponent(buttonDiv)
            .setButtonText("Confirm")
            .onClick(() => {
                this.callback(true);
                this.close();
            })
            .setCta();

        new ButtonComponent(buttonDiv).setButtonText("Cancel").onClick(() => {
            this.callback(false);
            this.close();
        });
        this.modal.open();
    }

    close() {
        this.modal.close();
    }
}
