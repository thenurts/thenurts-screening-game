// Developer mode switch (Game Ideas request #14). true = the wrench icon appears on Home; false = no dev code is
// even downloaded. To remove developer mode completely before launch, follow src/dev/README.md.
// (The build mode 'nodev' also forces it off; the automated tests use that to check the "off" state.)
export const DEV_MODE = true && import.meta.env.MODE !== 'nodev';
