# turbowarp-trans
go to "see inside project" then scroll down till you see two blocks with a + next to them, click it, then scroll down to custom extensions, it should have a simbole like this: **{ }**, and add this file in there by clicking "Add File". (or you can put the code in there by going over to "text" then putting to the raw code in there.

# 🐍 TurboWarp Python Transpiler (WIP)

Ever looked at a massive Scratch project and thought, "**MAN**... What would this actually look like in real code?" well, this extension solves that!

I always really disliked that Scratch never let you peek behind the curtain to see the actual text-based logic driving the blocks. Visual scripting is good for leaning how to understand how code works and the logic, but I wanted to see how it translated to a real language. I looked around for an extension that already did this, couldn't find one that actually hit the mark, so I'm building one myself.

* Note: This project is currently a Work in Progress (WIP). It's an early-stage tool to help you visualize your code structure in Python, not a flawless 1:1 game converter just yet!


 ## What It Does (and What's Implemented)

## Live Transpilation Layout.
* Injects a custom sidebar directly into the TurboWarp editor. As you look through your project, it maps your scripts into a Python/Pygame-style structure.

## Asset Extraction.
* Pulls sprite and stage images directly from the Scratch runtime. (UI Note: The assets grid can be a little sleepy—if your images aren't showing up right away, just click on the Sprites or Stage tabs to force them to register).

## Safe Exports.
* Hit the ⬇ .py button to download a .zip file containing a main.py script and an assets/ folder with your graphics.

## Pygame Integration.
* The generated code automatically appends a Pygame runtime template at the bottom, mapping basic movement and event loops.

## ⚠️ Current Limitations (Read This!)

Because this is an active project, not all blocks are supported yet.

  Unsupported Blocks.
		
  * The Pen, Sound, and Music categories (along with a few other complex opcodes) don't have Python translations yet.

## The Good News.
If the transpiler hits a block it doesn't recognize, it will automatically comment it out as a stub (e.g., # [sound_play]). It shouldn't break your generated Python code or cause
syntax crashes!

 # How to Use in _TurboWarp_
```
    Open TurboWarp.

    Click the Add Extension button at the bottom left.

    Scroll to the absolute bottom and select Custom Extension.

    Upload your turbowarp_python_transpiler.js file (or paste the source code).

    CRITICAL: You MUST check the "Run extension _unsandboxed_" box before loading, or the extension will completely fail.

    Click Load.

    In the new extension category, use the show Python sidebar block to open the view.
```

## Why does it have to run **"Unsandboxed"**?

By default, TurboWarp runs custom extensions inside a **sandbox** (an isolated, restricted environment like a closed room). This is a security feature to stop random scripts from messing with your browser. However, because a sandboxed extension is **locked** in its own little world, it is completely blinded from the rest of the editor.

This extension completely breaks out of that box for a few _crucial_ reasons:

## UI Injection.
To show you the Python code inside TurboWarp, the extension has to literally reach into the browser window and attach a brand new HTML sidebar panel (document.body.appendChild) and inject custom CSS. A sandboxed extension is blocked from touching TurboWarp's interface entirely.

## Deep Runtime Access.
To read your blocks and convert them on the fly, it needs deep, unrestricted access to the live _Scratch.vm_ processing engine.

## Asset Gathering & Zipping.
The extension uses external tools (JSZip) to grab raw image data from TurboWarp, bundle them up, and trigger a browser download. The sandbox blocks extensions from interacting with file generation and download triggers like this.

Running it **unsandboxed** gives the extension the permission it needs to look at the editor's data and paint the UI right next to your blocks.

# people who helped test

[GameRoos449](https://scratch.mit.edu/users/GameRoos449/)

