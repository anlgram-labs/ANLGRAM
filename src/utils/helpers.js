export const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 6
    }).format(amount);
};

export const formatAddress = (address, chars = 4) => {
    if (!address) return '';
    return `${address.substring(0, chars)}...${address.substring(address.length - chars)}`;
};

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const generateId = () => Math.random().toString(36).substr(2, 9);
