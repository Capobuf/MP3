const messages: Record<string, string> = {
    'Passkeys are not supported in this browser.':
        'Questo browser non supporta le passkey.',
    'WebAuthn is not supported in this browser':
        'Questo browser non supporta le passkey.',
    'The passkey operation was cancelled.':
        'L’operazione con la passkey è stata annullata.',
    'This device is already registered as a passkey.':
        'Questo dispositivo è già registrato come passkey.',
    'An unknown error occurred.': 'Si è verificato un errore imprevisto.',
    'Authentication was not completed': 'Autenticazione non completata.',
    'Registration was not completed': 'Registrazione non completata.',
    'Authentication ceremony was sent an abort signal':
        'Autenticazione annullata.',
    'Registration ceremony was sent an abort signal':
        'Registrazione annullata.',
    'Discoverable credentials were required but no available authenticator supported it':
        'Nessun dispositivo disponibile supporta le credenziali individuabili richieste.',
    'User verification was required during automatic registration but it could not be performed':
        'Impossibile verificare l’identità durante la registrazione automatica.',
    'User verification was required but no available authenticator supported it':
        'Nessun dispositivo disponibile supporta la verifica dell’identità richiesta.',
    'The authenticator was previously registered':
        'Il dispositivo è già registrato.',
    'No entry in pubKeyCredParams was of type "public-key"':
        'Nessuna voce in pubKeyCredParams è di tipo "public-key".',
    'No available authenticator supported any of the specified pubKeyCredParams algorithms':
        'Nessun dispositivo disponibile supporta gli algoritmi indicati in pubKeyCredParams.',
    'User ID was not between 1 and 64 characters':
        'L’ID utente deve contenere da 1 a 64 caratteri.',
    'The authenticator was unable to process the specified options, or could not create a new credential':
        'Il dispositivo non ha potuto elaborare le opzioni indicate o creare una nuova credenziale.',
    'The authenticator was unable to process the specified options, or could not create a new assertion signature':
        'Il dispositivo non ha potuto elaborare le opzioni indicate o firmare la verifica.',
};

export function passkeyError(message: string): string {
    const domain = message.match(
        /^Passkeys can't be used on (.+)\. For local development, use localhost\.$/,
    );
    if (domain) {
        return `Le passkey non possono essere usate su ${domain[1] === 'this domain' ? 'questo dominio' : domain[1]}. Per lo sviluppo locale, usa localhost.`;
    }

    const rpId = message.match(/^The RP ID "(.+)" is invalid for this domain$/);
    if (rpId) {
        return `L’ID RP "${rpId[1]}" non è valido per questo dominio.`;
    }

    const status = message.match(/^Request failed with status (\d{3})$/);
    if (status) {
        return `Richiesta non riuscita (stato HTTP ${status[1]}).`;
    }

    // shortcut: preserve unknown browser/device diagnostics; translate new stable library messages when encountered.
    return Object.hasOwn(messages, message) ? messages[message] : message;
}
