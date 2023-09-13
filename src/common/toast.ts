import { assertUnreachable, sleep } from './utils';

type ToastType = 'info' | 'success' | 'error';

const show = async (text: string, type: ToastType, timeout: number) => {
    const toastEl = document.createElement('div');
    toastEl.className = 'is-toast';
    toastEl.innerHTML = text;
    switch (type) {
        case 'info':
            toastEl.classList.add('is-toast_info');
            break;

        case 'success':
            toastEl.classList.add('is-toast_success');
            break;

        case 'error':
            toastEl.classList.add('is-toast_error');
            break;

        default:
            assertUnreachable(type);
    }
    const appElement = document.querySelector('#main.is-app');
    if (appElement === null) {
        throw new Error('App element not found');
    }
    appElement.appendChild(toastEl);
    await sleep(timeout);
    appElement.removeChild(toastEl);
};

const info = (text: string, timeout = 5000) => show(text, 'info', timeout);
const success = (text: string, timeout = 5000) => show(text, 'success', timeout);
const error = (text: string, timeout = 5000) => show(text, 'error', timeout);

export const toast = {
    info,
    success,
    error,
};
