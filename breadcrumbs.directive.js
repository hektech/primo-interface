    import {Component, Inject, OnInit} from 'ng-metadata/core';
    import {SearchService} from '../search.service';
    import {FacetService} from '../facet/facet.service';
    import {SearchStateService} from '../searchState.service';
    import {PrimolyticsService,beacon} from '../../analytics/primolytics.service';
    import {ConfigurationUtil} from '../../nddUtils/configurationUtil.service';
    import {BriefResultService} from "../briefResult/briefResult.service";
    import {MediaQueries} from "../../infra/mediaQueries.service";
    import {AnalyticsUtils} from '../../nddUtils/analyticsUtils.service';
    const omit = require('lodash/omit');
    const get = require('lodash/get');


    @Component({
            selector: "prm-breadcrumbs",
            templateUrl: 'components/search/breadcrumbs/breadcrumbs.html'
        })

     export class PrmBreadcrumbs implements OnInit{

        /* private members */  
        private _selectedFacets = undefined; // the current facet list
        private sendAllLockedAlert: boolean = false;
 
        constructor(@Inject('$mdSidenav') private $mdSidenav: angular.material.ISidenavService,
                private searchService : SearchService,
                private facetService : FacetService,
                private searchStateService : SearchStateService,
                private primolyticsService : PrimolyticsService,
                private briefResultService: BriefResultService,
                private configurationUtil : ConfigurationUtil,
                private mediaQueries: MediaQueries,
                private analyticsUtils: AnalyticsUtils,
                @Inject('$translate') private $translate: ng.translate.ITranslateService,
                @Inject('$q') private $q: ng.IQService) {

        }

        ngOnInit(){
            let searchObjectFacets = this.searchStateService.getSearchObject().facets;
            this.$q.all(searchObjectFacets.map((facet)=> facet.translationsPromise)).then(()=>{
                searchObjectFacets = searchObjectFacets.map(facet=> omit(facet, 'translationsPromise'));
                this._selectedFacets = this.facetService.transformActiveFacets(searchObjectFacets);
                this.enrichFacetsTranslations();
                this.searchService.activeFacets = this.selectedFacets;
            })	
        }
        
        private enrichFacetsTranslations() {
            if(!this._selectedFacets){
                return;
            }
            this._selectedFacets.forEach(( facet ) => {   
                let labelCode = this.facetLabel(facet);
                let defaultValue = this.getFacetDefaultValue(facet);
                
                this.$translate( labelCode, [] ,'', defaultValue ).then(( translation ) => {
                    facet.displayValue = translation;
                    facet.title = translation;
                });
            });
        }    
        /**
         * @ngdoc method
         * @name removeFacet
         * @methodOf starter.controller:FacetController
         * @description
         * Remove facet from query and perform a new search
         * Performs a search together with facets
         * @param {string} index - The facet array index which should be removed
         */
        @beacon({'p':'refine'})
        removeFacet(cur) {
            this.searchService.clearListOfVersion(cur);
            this.sendRemoveFacetsAnalytics(cur);
        }
        
        private clearAllFacets(){
            this.callBeaconClearAllFacets();
            this.sendRemoveFacetsAnalytics();
            this.facetService.facetSearch({removeAll: true});
        }

        @beacon({'p':'refine', 'OP':'resetFilters'})
        private callBeaconClearAllFacets(){
        }

        toggleFacets() {
            this.$mdSidenav('right').toggle();
        }
  
        public facetLabel(facet) {
            return this.facetService.facetLabel(facet);
        }
        
        get facets() {
            return this.facetService.getResults();
        }

        set facets(facets) {

        }
        
        public addStickyFacet(facet, needToSendRegularStickyBeacon) {
            if(needToSendRegularStickyBeacon){
                this.addStickyFacetBeacon(facet);
            }
            return this.facetService.addStickyFacet(facet);
        }
        
        public addStickyFacetBeacon(facet) {
            this.primolyticsService.doBeaconReport({
                'p': 'setPersistentFacet',
                'op': this.primolyticsService.getFacetAction(facet)
           }, facet, this.primolyticsService.getTimestamp());
        }

        @beacon({'p': 'setPersistentFacet', 'op': 'rememberFilters'})
        private runRememberAllFiltersBeaconCall() {}
        
        public removeStickyFacet(facet) {
            return this.facetService.removeStickyFacet(facet);
        }
        
        public rememberSelectedFilters(){
            this.sendAllLockedAlert = false;
            
            if(!this._selectedFacets){
                return;
            }
            // lock and fill all active filters
            this._selectedFacets.forEach(( facet ) => {
                if(!facet.persistent){
                    this.addStickyFacet(facet, false);
                    this.sendAllLockedAlert = true;
                }
             });
            
            if(this.sendAllLockedAlert){
                this.runRememberAllFiltersBeaconCall();
            }

        }
        
        public allFiltersAlreadySelected(){
            let allLocked: boolean = true;
            if(!this._selectedFacets){
                return false;
            }
            this._selectedFacets.forEach(( facet ) => {
                if(!facet.persistent){
                    allLocked = false;
                }
             });
            return allLocked;
        }
        
        get selectedFacets() {
            return this._selectedFacets;
        }

        set selectedFacets(dummy) {

        }

        get searchInfo() {
            return this.searchService.getResultObject().info;
        }
        
        
         public getFacetDefaultValue(facet) {
            return this.facetService.getFacetDefaultValue(facet);
         }
        
        public getTextDirection(facet) {
            let text = this.getFacetDefaultValue(facet);
            return this.briefResultService.getTextDirection(text);
         }
        public getFacetTitleTranslated(facet){
            return this.facetService.getFacetTitleTranslated(facet, {name:facet.name, useTranslations: facet.useTranslation});
        }

        public getTranslatedFacetGroupName(facetGroupName){
            return this.facetService.getTranslatedFacetGroupName(facetGroupName);
        }
        public getTranslatedRemoveTooltip(facet){
            let removeAndGroupNameString = `${this.getTranslatedRemoveString()} ${this.getTranslatedFacetGroupName(facet.name)}`;
            let titleEqualsGroupName = this.getTranslatedFacetGroupName(facet.name) === this.getFacetTitleTranslated(facet)
            return titleEqualsGroupName ? removeAndGroupNameString : `${removeAndGroupNameString} ${this.getFacetTitleTranslated(facet)}`;
        }

        public getTranslatedRemoveString(){
            if (!this.$translate.isReady()){
                return undefined;
            }
            return this.$translate.instant('nui.facets.remove.tooltip');
        }
        
        public getRememberFiltersLabels() {
            if (!this.allFiltersAlreadySelected()) {
                return this.$translate.instant('nui.aria.rememberFilters');
            } else {
                return this.$translate.instant('nui.aria.rememberFiltersDisabled') + ' ' + this.$translate.instant('nui.aria.rememberFilters.enableControls');
            }
        }

        private sendRemoveFacetsAnalytics(facet?) {
            let payload = this.getRemoveFacetAnalyticsPayload(facet);
            this.facetService.sendAnalytics(this.analyticsUtils.eventsNames.FACETS_USAGE, payload);
        }

        private getRemoveFacetAnalyticsPayload(facet?) {
            let methodSet, method, type, typeName, value, valueName, count, actionType;
            if(facet) {
                let isCreationDate = get(facet, 'name', '') === 'searchcreationdate';
                actionType = 'Remove';
                count = '1';
                method = this.facetService.capitalizeFirstLetter(get(facet, 'type', ''));
                type = [get(facet, 'name', '')];
                typeName = [this.getTranslatedFacetGroupName(isCreationDate ? 'creationdate' : type)];
                value = [get(facet, 'value', '')];
                valueName = isCreationDate ? [get(facet, 'displayValue', '').replace(get(facet, 'label', ''), "")] : [get(facet, 'displayValue', '')];
            } else {
                actionType = 'Reset all';
                methodSet = Array.from(new Set(this._selectedFacets.map(facet => get(facet, 'type', ''))));
                count = this._selectedFacets.length;
                method = methodSet.length > 1 ? 'Mix' : this.facetService.capitalizeFirstLetter(methodSet[0]);
                type = this._selectedFacets.map(facet => get(facet, 'name', ''));
                typeName = this._selectedFacets.map(facet => this.getTranslatedFacetGroupName(get(facet, 'name', '') === 'searchcreationdate' ? 'creationdate' : get(facet, 'name', '')))
                value = this._selectedFacets.map(facet => get(facet, 'value', ''));
                valueName = this._selectedFacets.map(facet => get(facet, 'name', '') === 'searchcreationdate' ? get(facet, 'displayValue', '').replace(get(facet, 'label', ''), "") : get(facet, 'displayValue', ''));
            }

            return {
                "Facet Action Type": actionType,
                "Facets Count": count,
                "Facet Method": method,
                "Facet Type": type,
                "Facet Type Name": typeName,
                "Facet Value": value,
                "Facet Value Name": valueName
            }
        }
    }





// WEBPACK FOOTER //
// ./src/main/webapp/components/search/breadcrumbs/breadcrumbs.directive.ts