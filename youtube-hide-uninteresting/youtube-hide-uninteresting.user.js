// ==UserScript==
// @name         YouTube – Videos als uninteressant markieren
// @namespace    https://github.com/achimt/userscripts
// @version      1.0.0
// @description  Fügt jedem Video auf der YouTube-Startseite einen Button hinzu, um es dauerhaft auszublenden.
// @author       achimt
// @match        https://www.youtube.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/achimt/userscripts/main/youtube-hide-uninteresting/youtube-hide-uninteresting.user.js
// @downloadURL  https://raw.githubusercontent.com/achimt/userscripts/main/youtube-hide-uninteresting/youtube-hide-uninteresting.user.js
// ==/UserScript==

(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // Storage: verwaltet die Liste ausgeblendeter Video-IDs
    // -------------------------------------------------------------------------
    const STORAGE_KEY = 'yt_hidden_videos';

    function loadHidden() {
        const raw = GM_getValue(STORAGE_KEY, '[]');
        try {
            return new Set(JSON.parse(raw));
        } catch {
            return new Set();
        }
    }

    function saveHidden(set) {
        GM_setValue(STORAGE_KEY, JSON.stringify([...set]));
    }

    function hideVideo(videoId) {
        const hidden = loadHidden();
        hidden.add(videoId);
        saveHidden(hidden);
    }

    function isHidden(videoId) {
        return loadHidden().has(videoId);
    }

    // -------------------------------------------------------------------------
    // DOM-Hilfsfunktionen
    // -------------------------------------------------------------------------

    /** Extrahiert die Video-ID aus einem href wie /watch?v=XXXXXXXXXXX */
    function extractVideoId(href) {
        if (!href) return null;
        const url = new URL(href, 'https://www.youtube.com');
        return url.searchParams.get('v');
    }

    /** Sucht den nächsten Video-Container (ytd-rich-item-renderer oder ytd-compact-video-renderer) */
    function findVideoContainer(element) {
        return element.closest(
            'ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer'
        );
    }

    /** Erstellt den "✕ Ausblenden"-Button */
    function createHideButton(videoId) {
        const btn = document.createElement('button');
        btn.textContent = '✕';
        btn.title = 'Video ausblenden';
        btn.dataset.ytHideId = videoId;

        Object.assign(btn.style, {
            position:        'absolute',
            top:             '6px',
            right:           '6px',
            zIndex:          '9999',
            background:      'rgba(0,0,0,0.7)',
            color:           '#fff',
            border:          'none',
            borderRadius:    '4px',
            padding:         '2px 7px',
            cursor:          'pointer',
            fontSize:        '14px',
            lineHeight:      '1.4',
            opacity:         '0',
            transition:      'opacity 0.15s',
            pointerEvents:   'auto',
        });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideVideo(videoId);
            const container = findVideoContainer(btn);
            if (container) container.style.display = 'none';
        });

        return btn;
    }

    // -------------------------------------------------------------------------
    // Verarbeitung einzelner Video-Karten
    // -------------------------------------------------------------------------
    function processCard(card) {
        // Bereits verarbeitet?
        if (card.dataset.ytHideProcessed) return;
        card.dataset.ytHideProcessed = '1';

        const link = card.querySelector('a#video-title-link, a#thumbnail');
        if (!link) return;

        const videoId = extractVideoId(link.href);
        if (!videoId) return;

        // Ausblenden falls bereits markiert
        if (isHidden(videoId)) {
            card.style.display = 'none';
            return;
        }

        // Thumbnail-Container ermitteln für Positionierung des Buttons
        const thumb = card.querySelector('#thumbnail, ytd-thumbnail');
        if (!thumb) return;

        // Relativ-Positionierung sicherstellen
        const thumbStyle = window.getComputedStyle(thumb);
        if (thumbStyle.position === 'static') {
            thumb.style.position = 'relative';
        }

        const btn = createHideButton(videoId);
        thumb.appendChild(btn);

        // Button beim Hover ein-/ausblenden
        thumb.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
        thumb.addEventListener('mouseleave', () => { btn.style.opacity = '0'; });
    }

    // -------------------------------------------------------------------------
    // MutationObserver – YouTube ist eine SPA, Inhalte werden nachgeladen
    // -------------------------------------------------------------------------
    function processAll() {
        document.querySelectorAll(
            'ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer'
        ).forEach(processCard);
    }

    const observer = new MutationObserver(() => processAll());
    observer.observe(document.body, { childList: true, subtree: true });

    // Initialer Durchlauf nach kurzem Delay (DOM noch nicht vollständig)
    setTimeout(processAll, 1500);

})();
