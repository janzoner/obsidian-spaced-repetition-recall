import { RPITEMTYPE } from "./data";
import { SRSettings } from "src/settings";
import { BlockUtils } from "src/util/utils_recall";
import { CardType } from "src/Question";
import { parse } from "src/parser";

/**
 * TrackedFile.
 */
export interface ITrackedFile {
    /**
     * @type {string}
     */
    path: string;
    /**
     * @type {Record<string, number>}
     */
    items: Record<string, number>;
    /**
     * @type {CardInfo[]}
     */
    cardItems?: CardInfo[];
    /**
     * @type {string[]}
     */
    tags: string[];
}

/**
 * CardInfo
 */
export class CardInfo {
    /**
     * @type {number}
     */
    lineNo: number;
    /**
     * @type {string}
     */
    cardTextHash: string;
    /**
     * @type {number[]}
     */
    itemIds: number[];

    constructor(lineNo: number = -1, cardTextHash: string = "") {
        this.lineNo = lineNo;
        this.cardTextHash = cardTextHash;
        this.itemIds = [];
    }
}

export class TrackedFile implements ITrackedFile {
    /**
     * @type {string}
     */
    path: string;
    /**
     * @type {Record<string, number>}
     */
    items: Record<string, number>;
    /**
     * @type {CardInfo[]}
     */
    cardItems?: CardInfo[];
    /**
     * @type {string[]}
     */
    tags: string[];

    static create(trackedfile: ITrackedFile): TrackedFile {
        let tf: TrackedFile;
        try {
            tf = new TrackedFile(trackedfile.path, RPITEMTYPE.NOTE, trackedfile.tags.last());
            Object.assign(tf, trackedfile);
        } catch (error) {
            return tf;
        }
        return tf;
    }

    constructor(path: string = "", type: RPITEMTYPE = RPITEMTYPE.NOTE, dname?: string) {
        this.path = path;
        this.items = {};
        this.tags = [type];
        if (type === RPITEMTYPE.CARD) {
            this.cardItems = [];
        }
        if (dname !== undefined) {
            this.tags.push(dname);
        }
    }

    /**
     * renameTrackedFile.
     *
     * @param {string} newPath
     */
    rename(newPath: string) {
        const old = this.path;
        this.path = newPath;
        console.log("Updated tracking: " + old + " -> " + newPath);
    }

    /**
     * getSyncCardInfoIndex
     * @param lineNo
     * @param cardTextHash
     * @returns {CardInfo} cardinfo | null: didn't have cardInfo
     */
    getSyncCardInfo(lineNo: number, cardTextHash?: string): CardInfo {
        let cardind = -2;
        if (this.cardItems != undefined) {
            cardind = this.cardItems.findIndex((cinfo: CardInfo, _ind, _obj) => {
                let res = false;
                if (cardTextHash != null && cinfo.cardTextHash === cardTextHash) {
                    cinfo.lineNo = lineNo;
                    res = true;
                } else if (cinfo.lineNo === lineNo) {
                    cinfo.cardTextHash = cardTextHash;
                    res = true;
                }
                return res;
            });
        }
        return cardind >= 0 ? this.cardItems[cardind] : null;
    }

    /**
     * syncNoteCardsIndex
     * only check and sync index, not add/remove cardinfo/ids/items.
     * @param note
     * @returns
     */
    syncNoteCardsIndex(
        fileText: string,
        settings: SRSettings,
        callback?: (cardText: string, cardinfo: CardInfo) => void,
    ) {
        if (callback == null) {
            if (!this.hasCards) {
                return;
            }
        }

        // const settings = plugin.data.settings;
        let negIndFlag = false;
        const lines: number[] = [];
        const cardHashList: Record<number, string> = {};

        const parsedCards: [CardType, string, number][] = parse(
            fileText,
            settings.singleLineCardSeparator,
            settings.singleLineReversedCardSeparator,
            settings.multilineCardSeparator,
            settings.multilineReversedCardSeparator,
            settings.convertHighlightsToClozes,
            settings.convertBoldTextToClozes,
            settings.convertCurlyBracketsToClozes,
        );

        for (const parsedCard of parsedCards) {
            // deckPath = noteDeckPath;
            const lineNo: number = parsedCard[2];
            let cardText: string = parsedCard[1];

            if (cardText.includes(settings.editLaterTag)) {
                continue;
            }

            if (!settings.convertFoldersToDecks) {
                const tagInCardRegEx = /^#[^\s#]+/gi;
                const cardDeckPath = cardText
                    .match(tagInCardRegEx)
                    ?.slice(-1)[0]
                    .replace("#", "")
                    .split("/");
                if (cardDeckPath) {
                    // deckPath = cardDeckPath;
                    cardText = cardText.replaceAll(tagInCardRegEx, "");
                }
            }

            const cardTextHash: string = BlockUtils.getTxtHash(cardText);

            const cardinfo = this.getSyncCardInfo(lineNo, cardTextHash);
            if (callback != null) {
                callback(cardText, {
                    lineNo: lineNo,
                    cardTextHash: cardTextHash,
                    itemIds: cardinfo?.itemIds,
                });
            }
            lines.push(lineNo);
            cardHashList[lineNo] = cardTextHash;
            if (cardinfo == null) {
                negIndFlag = true;
            }
        }
        // console.debug("cardHashList: ", cardHashList);

        // sync by total parsedCards.length
        if (!this.hasCards) {
            return;
        }
        const carditems = this?.cardItems;
        if (lines.length === carditems.length && negIndFlag) {
            for (let i = 0; i < lines.length; i++) {
                if (lines[i] !== carditems[i].lineNo) {
                    carditems[i].lineNo = lines[i];
                    this.getSyncCardInfo(lines[i], cardHashList[lines[i]]);
                }
            }
        }
        // store.save();
        return;
    }

    get lastTag() {
        const last = this.tags.last();
        if (last) {
            if (last !== RPITEMTYPE.NOTE && last !== RPITEMTYPE.CARD) {
                return last;
            }
        }
        return null;
    }

    updateTags(deckName: string) {
        if (!this.tags.includes(deckName)) {
            this.tags.push(deckName);
        }
    }

    get noteId() {
        return this.items.file;
    }

    get hasCards() {
        return this.cardItems !== undefined;
    }

    /**
     * trackCard
     * 添加笔记中特定行的卡片（组）
     * @param note
     * @param lineNo
     * @param cardTextHash
     * @returns {CardInfo} cardInfo of new add.
     */
    trackCard(lineNo: number, cardTextHash: string): CardInfo {
        if (!this.hasCards) {
            // didn't have cardItems
            this.cardItems = [];
        }

        const cardinfo = this.getSyncCardInfo(lineNo, cardTextHash);
        if (cardinfo != null) {
            return cardinfo;
        }

        const newcardItem: CardInfo = new CardInfo(lineNo, cardTextHash);

        const _cind = this.cardItems.push(newcardItem) - 1;
        this.cardItems.sort((a, b) => {
            return a.lineNo - b.lineNo;
        });
        return newcardItem;
    }
}
