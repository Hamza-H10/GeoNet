// Lightweight DFT worker to avoid blocking the main thread
export type FFTRequest = {
    x: number[];
    y: number[];
    z: number[];
};
export type FFTResponse = {
    xSpec: number[];
    ySpec: number[];
    zSpec: number[];
};

const hannWindow = (N: number) => Array.from({ length: N }, (_, n) => 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1))));

function dftMagnitude(input: number[]): number[] {
    const N = input.length;
    if (N === 0) return [];
    const win = hannWindow(N);
    const mags: number[] = [];
    const half = Math.floor(N / 2);
    for (let k = 0; k <= half; k++) {
        let re = 0;
        let im = 0;
        const twoPiKNOverN = (-2 * Math.PI * k) / N;
        for (let n = 0; n < N; n++) {
            const wv = input[n] * win[n];
            const angle = twoPiKNOverN * n;
            re += wv * Math.cos(angle);
            im += wv * Math.sin(angle);
        }
        const mag = Math.sqrt(re * re + im * im) / (N / 2);
        mags.push(Number(mag.toFixed(4)));
    }
    return mags;
}

self.addEventListener('message', (evt: MessageEvent<FFTRequest>) => {
    try {
        const { x, y, z } = evt.data || { x: [], y: [], z: [] };
        const xSpec = dftMagnitude(x);
        const ySpec = dftMagnitude(y);
        const zSpec = dftMagnitude(z);
        const resp: FFTResponse = { xSpec, ySpec, zSpec };
        (self as unknown as { postMessage: (data: FFTResponse) => void }).postMessage(resp);
    } catch {
        // Fail silently; main thread can handle missing response
    }
});
