import { TFile } from "obsidian";
import { NoteEaseList } from "src/NoteEaseList";
import * as graph from "pagerank.js";
import { LinkStat } from "src/main";
import { SRSettings } from "src/settings";

export function updategraphLink(incomingLinks: Record<string, LinkStat[]>, noteFile: TFile) {
    if (incomingLinks[noteFile.path] === undefined) {
        incomingLinks[noteFile.path] = [];
    }

    const links = app.metadataCache.resolvedLinks[noteFile.path] || {};
    for (const targetPath in links) {
        if (incomingLinks[targetPath] === undefined) incomingLinks[targetPath] = [];

        // markdown files only
        if (targetPath.split(".").pop().toLowerCase() === "md") {
            incomingLinks[targetPath].push({
                sourcePath: noteFile.path,
                linkCount: links[targetPath],
            });

            graph.link(noteFile.path, targetPath, links[targetPath]);
        }
    }
}

export function calcLinkContribution(
    note: TFile,
    easeByPath: NoteEaseList,
    incomingLinks: Record<string, LinkStat[]>,
    pageranks: Record<string, number>,
    settings: SRSettings,
) {
    const algoSettings = settings.algorithmSettings[settings.algorithm];
    const baseEase = algoSettings.baseEase;
    let linkTotal = 0,
        linkPGTotal = 0,
        totalLinkCount = 0;

    for (const statObj of incomingLinks[note.path] || []) {
        const ease: number = easeByPath.getEaseByPath(statObj.sourcePath);
        if (ease) {
            linkTotal += statObj.linkCount * pageranks[statObj.sourcePath] * ease;
            linkPGTotal += pageranks[statObj.sourcePath] * statObj.linkCount;
            totalLinkCount += statObj.linkCount;
        }
    }

    const outgoingLinks = app.metadataCache.resolvedLinks[note.path] || {};
    for (const linkedFilePath in outgoingLinks) {
        const ease: number = easeByPath.getEaseByPath(linkedFilePath);
        if (ease) {
            const prank = outgoingLinks[linkedFilePath] * pageranks[linkedFilePath];
            linkTotal += prank * ease;
            linkPGTotal += prank;
            totalLinkCount += outgoingLinks[linkedFilePath];
        }
    }

    // fix: settings.maxLinkFactor will be used in three algorithm, but not show in settings.
    const linkContribution: number =
        settings.maxLinkFactor * Math.min(1.0, Math.log(totalLinkCount + 0.5) / Math.log(64));

    let ease: number = baseEase;
    ease =
        (1.0 - linkContribution) * baseEase +
        (totalLinkCount > 0
            ? (linkContribution * linkTotal) / linkPGTotal
            : linkContribution * baseEase);
    // add note's average flashcard ease if available
    if (Object.prototype.hasOwnProperty.call(easeByPath, note.path)) {
        ease = (ease + easeByPath.getEaseByPath(note.path)) / 2;
    }
    ease = Math.round(ease * 100) / 100;
    if (isNaN(ease)) {
        throw new Error("ease: NaN.");
    }

    return {
        linkContribution,
        totalLinkCount,
        linkTotal,
        linkPGTotal,
        ease,
    };
}
