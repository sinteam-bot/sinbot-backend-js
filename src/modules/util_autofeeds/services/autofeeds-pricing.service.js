/**
 * autofeeds-pricing.service.js
 * 
 * Traqueur de Prix & Historique des Bons Plans (Price Drop & All-Time Low).
 * Analyse les réductions, extrait les prix actuels et originaux, et calcule
 * si une offre atteint un plus bas prix historique (All-Time Low).
 */

class AutofeedsPricingService {
    /**
     * Tente d'extraire les informations tarifaires d'un titre et/ou d'un texte.
     * @param {string} text 
     * @param {string} [title] 
     * @returns {Object}
     */
    extractPriceInfo(text = '', title = '') {
        const fullContent = `${title || ''} ${text || ''}`.trim();
        if (!fullContent) {
            return { hasPrice: false };
        }

        let isFree = false;
        let discountPercent = 0;
        let originalPrice = null;
        let currentPrice = null;
        let currency = 'EUR';

        // 1. Détection gratuité
        if (/\b(100%\s*(?:off|réduction|de réduction)|gratuit(?:e)?|free|offert(?:e)?)\b/i.test(fullContent)) {
            isFree = true;
            discountPercent = 100;
            currentPrice = '0,00 €';
        }

        // 2. Détection pourcentage de remise (-75%, 75% off)
        const discountMatch = fullContent.match(/[-−]\s*([0-9]{1,3})\s*%|\b([0-9]{1,3})\s*%\s*(?:off|de réduction|réduction)\b/i);
        if (discountMatch) {
            const val = parseInt(discountMatch[1] || discountMatch[2], 10);
            if (!isNaN(val) && val > 0 && val <= 100) {
                discountPercent = Math.max(discountPercent, val);
            }
        }

        // 3. Détection des devises
        if (/[$]/i.test(fullContent)) currency = '$';
        else if (/[£]/i.test(fullContent)) currency = '£';
        else if (/[€]|eur(?:o(?:s)?)?/i.test(fullContent)) currency = '€';

        // 4. Détection prix transition
        const auLieuDeMatch = fullContent.match(/([0-9]+[.,][0-9]{2})\s*(?:€|\$|£)?\s*(?:au lieu de|instead of)\s*([0-9]+[.,][0-9]{2})\s*(?:€|\$|£)?/i);
        const transitionMatch = fullContent.match(/([0-9]+[.,][0-9]{2})\s*(?:€|\$|£)?\s*(?:➔|->|→|was)\s*([0-9]+[.,][0-9]{2})\s*(?:€|\$|£)?/i);

        if (auLieuDeMatch) {
            currentPrice = this._formatCurrency(auLieuDeMatch[1], currency);
            originalPrice = this._formatCurrency(auLieuDeMatch[2], currency);
        } else if (transitionMatch) {
            originalPrice = this._formatCurrency(transitionMatch[1], currency);
            if (!isFree) {
                currentPrice = this._formatCurrency(transitionMatch[2], currency);
            }
        } else {
            const singleAuLieuDe = fullContent.match(/(?:au lieu de|instead of|was)\s*([0-9]+[.,][0-9]{2})\s*(?:€|\$|£)?/i);
            if (singleAuLieuDe) {
                originalPrice = this._formatCurrency(singleAuLieuDe[1], currency);
            }
        }

        // 5. Détection de prix simple si non trouvé
        if (!currentPrice && !isFree) {
            const simplePriceMatch = fullContent.match(/([0-9]+[.,][0-9]{2})\s*(?:€|\$|£)/i);
            if (simplePriceMatch) {
                currentPrice = this._formatCurrency(simplePriceMatch[1], currency);
            }
        }

        // 6. Calcul automatique du discount si originalPrice et currentPrice connus mais discountPercent manquant
        if (originalPrice && currentPrice && discountPercent === 0) {
            const origNum = this._parsePriceNumber(originalPrice);
            const curNum = this._parsePriceNumber(currentPrice);
            if (origNum > 0 && curNum < origNum) {
                discountPercent = Math.round(((origNum - curNum) / origNum) * 100);
            }
        }

        const hasPrice = isFree || Boolean(currentPrice) || discountPercent > 0;
        const numCur = this._parsePriceNumber(currentPrice);
        const numOrig = this._parsePriceNumber(originalPrice);

        return {
            hasPrice,
            isFree,
            discountPercent,
            originalPrice: numOrig !== null ? numOrig : (originalPrice || null),
            currentPrice: isFree ? 0 : (numCur !== null ? numCur : (currentPrice || null)),
            formattedOriginalPrice: originalPrice,
            formattedCurrentPrice: currentPrice,
            currency
        };
    }

    /**
     * Compare l'offre courante avec l'historique des prix pour déterminer s'il s'agit d'un All-Time Low (ATL).
     * @param {Object} currentDeal Résultat de extractPriceInfo
     * @param {Array<Object>} history Historique des prix passés
     * @returns {Object} Analyse enrichie avec ATL et label formaté
     */
    analyzeDeal(currentDeal, history = []) {
        if (!currentDeal || !currentDeal.hasPrice) {
            return { ...currentDeal, isAllTimeLow: false, badgeText: null };
        }

        const curNum = this._parsePriceNumber(currentDeal.currentPrice);
        let isAllTimeLow = false;

        if (currentDeal.isFree) {
            isAllTimeLow = true;
        } else if (history.length > 0 && curNum !== null) {
            const pastPrices = history
                .map(h => this._parsePriceNumber(h.currentPrice))
                .filter(p => p !== null && p > 0);

            if (pastPrices.length > 0) {
                const minPast = Math.min(...pastPrices);
                if (curNum <= minPast) {
                    isAllTimeLow = true;
                }
            } else {
                isAllTimeLow = true;
            }
        } else if (history.length === 0 && curNum !== null) {
            isAllTimeLow = true;
        }

        let badgeParts = [];
        if (currentDeal.discountPercent > 0) {
            badgeParts.push(`🏷️ -${currentDeal.discountPercent}%`);
        }
        if (currentDeal.currentPrice) {
            if (currentDeal.originalPrice) {
                badgeParts.push(`${currentDeal.currentPrice} *(au lieu de ${currentDeal.originalPrice})*`);
            } else {
                badgeParts.push(`${currentDeal.currentPrice}`);
            }
        }
        if (isAllTimeLow && !currentDeal.isFree) {
            badgeParts.push('🔥 **PLUS BAS PRIX HISTORIQUE !**');
        } else if (currentDeal.isFree) {
            badgeParts.push('🎁 **100% GRATUIT !**');
        }

        return {
            ...currentDeal,
            isAllTimeLow,
            badgeText: badgeParts.join(' • ')
        };
    }

    constructor(repo = null) {
        this.repo = repo;
    }

    /**
     * Alias convivial pour extractPriceInfo
     */
    extractPriceAndDiscount(text = '', title = '') {
        return this.extractPriceInfo(text, title);
    }

    meetsMinDiscount(priceInfo, minDiscountPercent) {
        if (!minDiscountPercent || minDiscountPercent <= 0) return true;
        const discount = priceInfo?.discountPercent || 0;
        return discount >= minDiscountPercent;
    }

    formatDiscountBadge(deal) {
        let badgeParts = [];
        if (deal.discountPercent > 0) {
            badgeParts.push(`🏷️ -${deal.discountPercent}%`);
        }
        if (deal.currentPrice !== null && deal.currentPrice !== undefined) {
            const curStr = typeof deal.currentPrice === 'number' ? `${deal.currentPrice} ${deal.currency || '€'}` : deal.currentPrice;
            if (deal.originalPrice) {
                const origStr = typeof deal.originalPrice === 'number' ? `${deal.originalPrice} ${deal.currency || '€'}` : deal.originalPrice;
                badgeParts.push(`${curStr} *(au lieu de ${origStr})*`);
            } else {
                badgeParts.push(`${curStr}`);
            }
        }
        if (deal.isAllTimeLow && !deal.isFree) {
            badgeParts.push('🔥 **PLUS BAS PRIX HISTORIQUE !**');
        } else if (deal.isFree) {
            badgeParts.push('🎁 **100% GRATUIT !**');
        }
        return badgeParts.join(' • ');
    }

    async analyzeAndRecordPrice({ feedId, itemUrl, title, priceInfo }) {
        let lowest = null;
        if (this.repo && typeof this.repo.getLowestHistoricalPrice === 'function') {
            const lowestRes = await this.repo.getLowestHistoricalPrice(itemUrl);
            lowest = (lowestRes && typeof lowestRes === 'object' && lowestRes.amount !== undefined)
                ? lowestRes.amount
                : (typeof lowestRes === 'number' ? lowestRes : null);
        }

        const curNum = typeof priceInfo.currentPrice === 'number'
            ? priceInfo.currentPrice
            : this._parsePriceNumber(priceInfo.currentPrice);

        const isAllTimeLow = lowest === null || (curNum !== null && curNum <= lowest);

        if (this.repo && typeof this.repo.recordPriceHistory === 'function') {
            await this.repo.recordPriceHistory({
                feedId,
                itemUrl,
                title,
                currentPrice: curNum,
                originalPrice: typeof priceInfo.originalPrice === 'number' ? priceInfo.originalPrice : this._parsePriceNumber(priceInfo.originalPrice),
                discountPercent: priceInfo.discountPercent,
                currency: priceInfo.currency,
                isAllTimeLow
            });
        }

        return {
            isAllTimeLow,
            previousLowest: lowest,
            currentPrice: curNum
        };
    }

    /**
     * Détermine si une publication doit être filtrée selon le pourcentage minimal requis.
     */
    shouldFilterByDiscount(discountPercent, minDiscountPercent) {
        if (!minDiscountPercent || minDiscountPercent <= 0) return false;
        return (Number(discountPercent || 0) < Number(minDiscountPercent));
    }

    _parsePriceNumber(priceStr) {
        if (typeof priceStr === 'number') return priceStr;
        if (!priceStr) return null;
        const cleaned = String(priceStr).replace(',', '.').replace(/[^0-9.]/g, '');
        const val = parseFloat(cleaned);
        return isNaN(val) ? null : val;
    }

    _formatCurrency(numStr, currency = 'EUR') {
        const val = this._parsePriceNumber(numStr);
        if (val === null) return numStr;
        const formatted = val.toFixed(2).replace('.', ',');
        if (currency === 'USD') return `$${formatted.replace(',', '.')}`;
        if (currency === 'GBP') return `£${formatted.replace(',', '.')}`;
        return `${formatted} €`;
    }
}

const autofeedsPricingService = new AutofeedsPricingService();

module.exports = {
    AutofeedsPricingService,
    autofeedsPricingService
};
