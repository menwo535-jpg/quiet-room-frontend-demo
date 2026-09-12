# Quiet Room — responsive interaction demo

An original HTML/CSS/JavaScript portfolio sample with two visual themes: a rainy reading room and a midnight radio studio. English and Chinese versions are available. This is a synthetic concept project, not a previous client deployment.

## Run

[Try the English demo](https://menwo535-jpg.github.io/quiet-room-frontend-demo/index-en.html) · [打开中文演示](https://menwo535-jpg.github.io/quiet-room-frontend-demo/)

Download this repository and open `index-en.html` (English) or `index.html` (Chinese) in a browser. No installation, build step, external fonts or API keys are needed.

## What to try

- Switch the two theme buttons at the top of the page.
- Open the character discovery view and return to a conversation.
- Choose a suggested opening message or type your own.
- Press Enter to send or Shift+Enter for a new line.
- Reset the conversation and resize to a narrow viewport.

The page includes responsive layouts, inline SVG scene artwork, keyboard focus styles and a reduced-motion preference. The reply flow uses predefined local text. It has no model backend, account system, payments, persistent chat storage or network requests.

## Previews

These screenshots show the original Chinese version. The English version uses the same scene artwork and interaction flow, with localized labels and replies.

### Desktop: reading room
![Reading room desktop preview](01-reading-room.png)

### Desktop: midnight radio
![Midnight radio desktop preview](02-midnight-radio.png)

### Narrow screen
![Narrow screen preview](03-mobile.png)

## Scope and verification

The original Chinese demo was checked locally for theme switching, discovery navigation, message entry, resetting and narrow-screen layout. On September 12, 2026, the English version was also checked in the available Chromium browser: theme switching, discovery navigation, suggested prompts, typed messages, Enter-to-send, and cancelling a pending reply by resetting. Desktop and 375 px iframe layouts were visually inspected. The English page's link back to the Chinese version was checked as well.

This is a front-end concept sample. It does not demonstrate React, Webflow or WordPress integration, cross-browser certification, a production backend or client acceptance.
