(function () {
    var Ext = window.Ext4 || window.Ext;

Ext.define('Rally.app.DependencyView.app', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    config: {
        defaultSettings: {
            includeStories: false,
            usePreliminaryEstimate: false,
            hideArchived: false,
            sizeStoriesByPlanEstimate: false,
            useScheduleState: true
        }
    },
    autoScroll: true,
    itemId: 'rallyApp',
    NODE_CIRCLE_SIZE: 8,
    MIN_CARD_WIDTH: 150,        //Looks silly on less than this
    CARD_BORDER_WIDTH: 5,
    MIN_ROW_WIDTH: 160,
    MIN_CARD_HEIGHT:    150,
    MIN_ROW_HEIGHT: 160 ,         //Bit more than the card to leave a gap
    LOAD_STORE_MAX_RECORDS: 100, //Can blow up the Rally.data.wsapi.filter.Or
    WARN_STORE_MAX_RECORDS: 300, //Can be slow if you fetch too many
    LEFT_MARGIN_SIZE: 0,               //Leave space for "World view" text
    MIN_COLUMN_WIDTH: 200,
    TITLE_NAME_LENGTH: 80,
    STORE_FETCH_FIELD_LIST:
    [
        'Name',
        'FormattedID',
        'Parent',
        'DragAndDropRank',
        'Children',
        'ObjectID',
        'Project',
        'DisplayColor',
        'Owner',
        'Blocked',
        'BlockedReason',
        'Ready',
        'Tags',
        'Workspace',
        'RevisionHistory',
        'CreationDate',
        'PercentDoneByStoryCount',
        'PercentDoneByStoryPlanEstimate',
        'State',
        'ScheduleState',
        'PlanEstimate',
        'PreliminaryEstimate',
        'PreliminaryEstimateValue',
        'Description',
        'Notes',
        'Predecessors',
        'Successors',
        'UserStories',
        'Tasks',
        'WorkProduct',
        'OrderIndex',   //Used to get the State field order index
        'Value'
        //Customer specific after here. Delete as appropriate
        // 'c_ProjectIDOBN',
        // 'c_QRWP',
        // 'c_RAGStatus',
        // 'c_ProgressUpdate'
    ],
    CARD_DISPLAY_FIELD_LIST:
    [
        'Name', //This one
//        'Owner',
        'PreliminaryEstimate',
        // 'Parent',
        // 'Project',
        'PercentDoneByStoryCount',
        'PercentDoneByStoryPlanEstimate',
        'ScheduleState',
        'State',
        // 'c_ProjectIDOBN',
        // 'c_QRWP',
        // 'c_RAGStatus'

    ],
    items: [
        {
            xtype: 'container',
            itemId: 'rootSurface',
            margin: '5 5 5 5',
            layout: 'auto',
            id: 'tree',
            listeners: {
                afterrender:  function() {  gApp = this.up('#rallyApp'); gApp._onElementValid(this);},
            }
        }
    ],

    onSettingsUpdate: function() {
        debugger;
        gApp._refreshTree();
    },

    getSettingsFields: function() {
        var returned = [
            {
                name: 'includeStories',
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Include User Stories',
                labelALign: 'middle'
            },
            {
                name: 'usePreliminaryEstimate',
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Use Preliminary Estimate',
                labelALign: 'middle'
            },
            {
                name: 'hideArchived',
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Do not show archived',
                labelALign: 'middle'
            },
            {
                name: 'sizeStoriesByPlanEstimate',
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Size Stories by Plan Estimate',
                labelALign: 'middle'
            },
            {
                name: 'useScheduleState',
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Stories coloured by Schedule State',
                labelALign: 'middle'
            }
            
        ];
        return returned;
    },

    timer: null,

    launch: function() {
        this.on('redrawTree', this._resetTimer);
        // this.on('drawChildren', this._drawChildren);
        this.timer = setTimeout(this._redrawTree, 1000);

    },

    _resetTimer: function() {
        if ( gApp.timer) clearTimeout(gApp.timer);
        gApp.timer = setTimeout(gApp._redrawTree, 1000);
    },
    
    _redrawTree: function() {
        if (gApp.down('#loadingBox')) gApp.down('#loadingBox').destroy();
        clearTimeout(gApp.timer);
        if (gApp._nodeTree) {
            _.each(gApp._nodeTree.descendants(),
                function(d) { 
                    if (d.card) 
                        d.card.destroy();
                }
            );
            d3.select('svg').remove();
            gApp._nodeTree = null;
        }
        gApp._enterMainApp();
    },

    _enterMainApp: function() {

        //Timer can fire before we retrieve anything
        if (!gApp._nodes.length) return;

        //Get all the nodes and the "Unknown" parent virtual nodes
        var nodetree = gApp._createTree(gApp._nodes);
        gApp._nodeTree = nodetree;
        var viewBox = [ 0, 0, 1200, 1200 ];
        gApp._setViewBox(viewBox);
        gApp._refreshTree();    //Need to redraw if things are added
    },

    _typeSizeStore: null,
    _typeSizeMax: 0,
    _storyStates: [],

    _resizeEvent: function(width, height) {
        gApp._setViewBox( [0,0,width, height]);
        gApp._redrawTree();
    },
    //Entry point after creation of render box
    _onElementValid: function(rs) {

        Ext.EventManager.onWindowResize(gApp._resizeEvent);
        gApp._typeSizeStore = Ext.create('Rally.data.wsapi.Store',        
            {
                itemId: 'typeSizeStore',
                autoLoad: true,
                model: 'PreliminaryEstimate',
                fetch: ['Name', 'Value'],
                listeners: {
                    load: function(store, data, success) {
                        if (success) {
                            _.each(data, function(v) {
                                gApp._typeSizeStore[v.get('Name')] = v.get('Value');
                                if (v.get('Value') > gApp._typeSizeMax) gApp._typeSizeMax = v.get('Value');
                            });
                        }
                    }
                }
            });
        Rally.data.ModelFactory.getModel({
            type: 'UserStory',
            success: function(model) {
                _.each(model.getField('ScheduleState').attributeDefinition.AllowedValues, function(value,idx) {
                    gApp._storyStates.push( { name: value.StringValue, value : idx});
                });
            }
        });
        //Add any useful selectors into this container ( which is inserted before the rootSurface )
        //Choose a point when all are 'ready' to jump off into the rest of the app
        var hdrBox = this.insert (0,{
            xtype: 'container',
            itemId: 'headerBox',
            layout: 'hbox',
            items: [
                {
                    xtype: 'container',
                    itemId: 'filterBox'
                },
                {
                    xtype:  'rallyportfolioitemtypecombobox',
                    itemId: 'piType',
                    fieldLabel: 'Choose Portfolio Type :',
                    labelWidth: 100,
                    margin: '5 0 5 20',
                    defaultSelectionPosition: 'first',
                    storeConfig: {
                        fetch: ['DisplayName', 'ElementName','Ordinal','Name','TypePath', 'Attributes']
                    },
                    listeners: {
                        select: function() { gApp._kickOff();},    //Jump off here to add portfolio size selector
                    }
                },
            ]
        });
    },

    dfs: null,

    _kickOff: function() {
//        debugger;        
        var ptype = gApp.down('#piType');
        var hdrBox = gApp.down('#headerBox');
        gApp._typeStore = ptype.store;
        var selector = gApp.down('#itemSelector');
        if ( selector) {
            selector.destroy();
        }
        hdrBox.insert(2,{
            xtype: 'rallyartifactsearchcombobox',
            fieldLabel: 'Choose Start Item :',
            itemId: 'itemSelector',
            labelWidth: 100,
            queryMode: 'remote',
            pageSize: 25,
            width: 600,
            margin: '10 0 5 20',
            storeConfig: {
                models: [ 'portfolioitem/' + ptype.rawValue ],
                fetch: gApp.STORE_FETCH_FIELD_LIST,
                context: gApp.getContext().getDataContext()
            },
            listeners: {
                select: function(selector,store) {
                    gApp.add( {
                        xtype: 'container',
                        itemId: 'loadingBox',
                        cls: 'info--box',
                        html: '<p> Loading... </p>'
                    });
                    if ( gApp._nodes) gApp._nodes = [];
                    gApp._getArtifacts(store);
                }
            }
        });
    },

    _getArtifacts: function(data) {
        //On re-entry send an event to redraw

        gApp._nodes = gApp._nodes.concat( gApp._createNodes(data));    //Add what we started with to the node list

        this.fireEvent('redrawTree');
        //Starting with highest selected by the combobox, go down

        _.each(data, function(parent) {
            //Limit this to portfolio items down to just above feature level and not beyond.
            //The lowest level portfolio item type has 'UserStories' not 'Children'
            if (parent.hasField('Children') && (!parent.data._ref.includes('hierarchicalrequirement'))){      
                collectionConfig = {
                    sorters: [{
                        property: 'DragAndDropRank',
                        direction: 'ASC'
                    }],
                    fetch: gApp.STORE_FETCH_FIELD_LIST,
                    callback: function(records, operation, success) {
                        //Start the recursive trawl down through the levels
                        if (records.length)  gApp._getArtifacts(records);
                    }
                };
                if (gApp.getSetting('hideArchived')) {
                    collectionConfig.filters = [{
                        property: 'Archived',
                        operator: '=',
                        value: false
                    }];
                }
                parent.getCollection( 'Children').load( collectionConfig );
            }
            else {
                //We are features or UserStories when we come here
                collectionConfig = {
                    sorters: [{
                        property: 'DragAndDropRank',
                        direction: 'ASC'  
                    }],
                    fetch: gApp.STORE_FETCH_FIELD_LIST,
                    callback: function(records, operation, s) {
                        if (s) {
                            if (records && records.length) {

                                //At this point, we need to decide whether we are adding nodes to the main tree
                                if (gApp.getSetting('includeStories')){
                                    gApp._nodes = gApp._nodes.concat( gApp._createNodes(records));
                                    gApp.fireEvent('redrawTree');
                                } 
                            }
                        }
                    }
                };
                //If we are lowest level PI, then we need to fetch User Stories
                if (parent.hasField('UserStories')) {  
                    collectionConfig.fetch.push(gApp._getModelFromOrd(0).split("/").pop()); //Add the lowest level field on User Stories
                    parent.getCollection( 'UserStories').load( collectionConfig );
                } 
                // //If we are userstories, then we need to fetch tasks
                // else if (parent.hasField('Tasks') && (gApp.getSetting('includeStories'))){
                //     parent.getCollection( 'Tasks').load( collectionConfig );                    
                // }
            }
        });
    },

    _nodes: [],     //For initial collection of artefacts fetched from Rally
    _nodeTree: null,    //Tree of artefacts created locally
    Nodes: null,   //For graphics display of nodeTree
    Links: null,    //For graphics connection lines
    PredecessorLinks: null,
    enableCards: false,
    view: null,
    
    _setViewBox: function(viewBox) {
        var displayBox = [ 1200, 900];
        var rs = this.down('#rootSurface');
        rs.getEl().setWidth(displayBox[0]);
        rs.getEl().setHeight(displayBox[1]);            
        gApp._radius = Math.min(viewBox[2] - viewBox[0], viewBox[3] - viewBox[1])/2;
    },

    _roundBigger: function(num) {
        if (num < 0) return Math.floor(num);
        if (num > 0) return Math.ceil(num);
        return num;
    },

    _roundOutTo: function ( lump, num) {
        return ( gApp._roundBigger(num/lump)*lump);
    },

    _addBigger: function (lump, num) {
        if (num < 0) return num - lump;
        if (num > 0) return num + lump;
        return num;
    },

    _refreshTree: function(){

        gApp._nodeTree.sum( function(d) {
            var t;
            if (d.record.isPortfolioItem()){
                if ( gApp.getSetting('usePreliminaryEstimate')){
                    retval = (t = d.record.get('PreliminaryEstimateValue'))? t : 1;
                } else {
                    retval = (t = d.record.get('LeafStoryCount'))? t : 1; 
                }
            }else {
                    //We are a User Story here
                    if ( gApp.getSetting('sizeStoriesByPlanEstimate')){
                        return (t = d.record.get('PlanEstimate'))?t:1;
                    }else {
                        return (t = d.record.get('DirectChildrenCount'))?t:1; 
                    }
                }
            return retval ? retval: 1;
        });

        gApp.Nodes = gApp._nodeTree.descendants();
        gApp.Links = _.map(gApp.Nodes, function (d, index, array) {
                return {
                    source: index,
                    target: d.parent ? _.findIndex(gApp.Nodes, function(j, index, array) {
                                            return d.parent.id === j.id;
                                        }): index
                };
        });

        //As far as links are concerned, successors are the same as predecessors
        gApp.PredecessorLinks = null;
        _.each(gApp.Nodes, function ( d, index, array) {
            var predecessors =  d.data.record.get('Predecessors');
            if ( predecessors && predecessors.Count) { 
                var collectionConfig = {
                    fetch: gApp.STORE_FETCH_FIELD_LIST,
                    callback: function(records, operation, success) {
                        var links = _.map(records, function( record ) {
                            return {
                                source: index,
                                // findIndex will return -1 if not found and we can use this to indicate 
                                //a predecessors that is out of scope
                                target: _.findIndex(gApp.Nodes, function(j, index, array) {
                                    return record.get('_ref') === j.id;
                                }),
                                value: d.value
                            };
                        });
                        gApp.PredecessorLinks = gApp.PredecessorLinks?gApp.PredecessorLinks.concat(links):links;
                        gApp._tick();
                    }
                };
                predecessors = d.data.record.getCollection('Predecessors').load( collectionConfig);
            }
        });
        gApp._tick();
    },

    _tick: function() {
        d3.select('svg').remove();
        var packageNames = [];
        var matrix = [];
        if ( gApp.Nodes.length > 0){
            _.each( gApp.Nodes, function(s) {
                packageNames.push(s.data.record.get('FormattedID'));
                matrix.push( _.map(gApp.Nodes, 
                    function(d){ return (s.id === d.id)?0.5:0;})); //Create an entry we will fill in next
            });
        }
        _.each(gApp.PredecessorLinks, function (d) {
            matrix[d.source][d.target] = d.value;
            matrix[d.source][d.source] = 0; //Remove link to self
        });
        var data = {
            packageNames: packageNames,
            matrix: matrix
        };

        var chart = d3.chart.dependencyWheel()
            .width(gApp._radius*2)    // also used for height, since the wheel is in a a square
            .margin(100)   // used to display package names
            .padding(0.02); // separating groups in the wheel
        
        var tree = d3.select('#tree');
        tree.datum(data)
            .call(chart);
    },

    _setDefaultZoom: function(node)
    {       
            var minX = Infinity, maxX = 0, minY = Infinity, maxY = 0;
            var circles = node.select('circle');
            circles.each( function(d) {
                var lx = gApp._addBigger(d.value, d.x), ly = gApp._addBigger(d.value, d.y);
                if (lx > maxX) maxX = lx;
                if (lx < minX) minX = lx;
                if (ly > maxY) maxY = ly;
                if (ly < minY) minY = ly;
            });

            if (( maxX === Infinity) || ( maxY === Infinity ))
            {
                console.log('Error in app: Infinity used!');
            }

            if ( (minX !== Infinity) && (minY !== Infinity)) {
                gApp._setViewBox( [ minX, minY, maxX, maxY]);
            }
            // g.attr("transform","translate(" + minX + "," + minY + ")");
//            gApp._DisplayPredecessors(true);            gApp._DisplaySuccessors(true);
    },
    
    // _nodeMouseOut: function(node, index,array){
    //     if (node.card) node.card.hide();
    // },

    // _nodeMouseOver: function(node,index,array) {
    //     if (!(node.data.record.data.ObjectID)) {
    //         //Only exists on real items, so do something for the 'unknown' item
    //         return;
    //     } else {
    //         if (!gApp.enableCards) return;
    //         if ( !node.card) {
    //             var card = Ext.create('Rally.ui.cardboard.Card', {
    //                 'record': node.data.record,
    //                 fields: gApp.CARD_DISPLAY_FIELD_LIST,
    //                 constrain: false,
    //                 width: gApp.MIN_COLUMN_WIDTH,
    //                 height: 'auto',
    //                 floating: true, //Allows us to control via the 'show' event
    //                 shadow: false,
    //                 showAge: true,
    //                 resizable: true,
    //                 listeners: {
    //                     show: function(card){
    //                         //Move card to the centre of the screen
    //                         var xpos = array[index].getScreenCTM().e;
    //                         var ypos = array[index].getScreenCTM().f;
    //                         card.el.setLeftTop( (xpos - gApp.MIN_CARD_WIDTH) < 0 ? xpos + gApp.MIN_CARD_WIDTH + gApp.MIN_COLUMN_WIDTH : xpos - gApp.MIN_CARD_WIDTH, 
    //                             (ypos + this.getSize().height)> gApp.getSize().height ? gApp.getSize().height - (this.getSize().height+20) : ypos);  //Tree is rotated
    //                     }
    //                 }
    //             });
    //             node.card = card;
    //         }
    //         node.card.show();
    //     }
    // },

    // _nodeClick: function (node,index,array) {
    //     if (!(node.data.record.data.ObjectID)) return; //Only exists on real items
    //     if (!gApp.enableCards) return;

    //     //Get ordinal (or something ) to indicate we are the lowest level, then use "UserStories" instead of "Children"

    //     var childField = null;
    //     var model = null;

    //     //Userstories have children, Portfolio Items have children... doh!
    //      if (node.data.record.hasField('Tasks')) {
    //         childField = 'Tasks';
    //         model = 'UserStory';
    //     }         
    //     else if (node.data.record.hasField('Children')) {
    //         childField = 'Children';
    //         model = node.data.record.data.Children._type;
    //     }
    //     else if (node.data.record.hasField('UserStories')){
    //         childField = 'UserStories';
    //         model = node.data.record.data._type;
    //     }
    //     else return;    //Don't do this for tasks.

    //     Ext.create('Rally.ui.dialog.Dialog', {
    //         autoShow: true,
    //         draggable: true,
    //         closable: true,
    //         width: 1100,
    //         height: 800,
    //         style: {
    //             border: "thick solid #000000"
    //         },
    //         overflowY: 'scroll',
    //         overflowX: 'none',
    //         record: node.data.record,
    //         disableScroll: false,
    //         model: model,
    //         childField: childField,
    //         title: 'Information for ' + node.data.record.get('FormattedID') + ': ' + node.data.record.get('Name'),
    //         layout: 'hbox',
    //         items: [
    //             {
    //                 xtype: 'container',
    //                 itemId: 'leftCol',
    //                 width: 500,
    //             },
    //             // {
    //             //     xtype: 'container',
    //             //     itemId: 'middleCol',
    //             //     width: 400
    //             // },
    //             {
    //                 xtype: 'container',
    //                 itemId: 'rightCol',
    //                 width: 580  //Leave 20 for scroll bar
    //             }
    //         ],
    //         listeners: {
    //             afterrender: function() {
    //                 this.down('#leftCol').add(
    //                     {
    //                             xtype: 'rallycard',
    //                             record: this.record,
    //                             fields: gApp.CARD_DISPLAY_FIELD_LIST,
    //                             showAge: true,
    //                             resizable: true
    //                     }
    //                 );

    //                 if ( this.record.get('c_ProgressUpdate')){
    //                     this.down('#leftCol').insert(1,
    //                         {
    //                             xtype: 'component',
    //                             width: '100%',
    //                             autoScroll: true,
    //                             html: this.record.get('c_ProgressUpdate')
    //                         }
    //                     );
    //                     this.down('#leftCol').insert(1,
    //                         {
    //                             xtype: 'text',
    //                             text: 'Progress Update: ',
    //                             style: {
    //                                 fontSize: '13px',
    //                                 textTransform: 'uppercase',
    //                                 fontFamily: 'ProximaNova,Helvetica,Arial',
    //                                 fontWeight: 'bold'
    //                             },
    //                             margin: '0 0 10 0'
    //                         }
    //                     );
    //                 }
    //                 //This is specific to customer. Features are used as RAIDs as well.
    //                 if ((this.record.self.ordinal === 1) && this.record.hasField('c_RAIDType')){
    //                     var rai = this.down('#leftCol').add(
    //                         {
    //                             xtype: 'rallypopoverchilditemslistview',
    //                             target: array[index],
    //                             record: this.record,
    //                             childField: this.childField,
    //                             addNewConfig: null,
    //                             gridConfig: {
    //                                 title: '<b>Risks and Issues:</b>',
    //                                 enableEditing: false,
    //                                 enableRanking: false,
    //                                 enableBulkEdit: false,
    //                                 showRowActionsColumn: false,
    //                                 storeConfig: this.RAIDStoreConfig(),
    //                                 columnCfgs : [
    //                                     'FormattedID',
    //                                     'Name',
    //                                     'c_RAIDType',
    //                                     'State',
    //                                     'c_RAGStatus',
    //                                     'ScheduleState'
    //                                 ]
    //                             },
    //                             model: this.model
    //                         }
    //                     );
    //                     rai.down('#header').destroy();
    //                }

    //                 var children = this.down('#leftCol').add(
    //                     {
    //                         xtype: 'rallypopoverchilditemslistview',
    //                         target: array[index],
    //                         record: this.record,
    //                         childField: this.childField,
    //                         addNewConfig: null,
    //                         gridConfig: {
    //                             title: '<b>Children:</b>',
    //                             enableEditing: false,
    //                             enableRanking: false,
    //                             enableBulkEdit: false,
    //                             showRowActionsColumn: false,
    //                             storeConfig: this.nonRAIDStoreConfig(),
    //                             columnCfgs : [
    //                                 'FormattedID',
    //                                 'Name',
    //                                 {
    //                                     text: '% By Count',
    //                                     dataIndex: 'PercentDoneByStoryCount'
    //                                 },
    //                                 {
    //                                     text: '% By Est',
    //                                     dataIndex: 'PercentDoneByStoryPlanEstimate'
    //                                 },
    //                                 'State',
    //                                 'c_RAGSatus',
    //                                 'ScheduleState'
    //                             ]
    //                         },
    //                         model: this.model
    //                     }
    //                 );
    //                 children.down('#header').destroy();

    //                 var cfd = Ext.create('Rally.apps.CFDChart', {
    //                     record: this.record,
    //                     container: this.down('#rightCol')
    //                 });
    //                 cfd.generateChart();

    //                 //Now add predecessors and successors
    //                 var preds = this.down('#rightCol').add(
    //                     {
    //                         xtype: 'rallypopoverchilditemslistview',
    //                         target: array[index],
    //                         record: this.record,
    //                         childField: 'Predecessors',
    //                         addNewConfig: null,
    //                         gridConfig: {
    //                             title: '<b>Predecessors:</b>',
    //                             enableEditing: false,
    //                             enableRanking: false,
    //                             enableBulkEdit: false,
    //                             showRowActionsColumn: false,
    //                             columnCfgs : [
    //                             'FormattedID',
    //                             'Name',
    //                             {
    //                                 text: '% By Count',
    //                                 dataIndex: 'PercentDoneByStoryCount'
    //                             },
    //                             {
    //                                 text: '% By Est',
    //                                 dataIndex: 'PercentDoneByStoryPlanEstimate'
    //                             },
    //                             'State',
    //                             'c_RAGSatus',
    //                             'ScheduleState'
    //                             ]
    //                         },
    //                         model: this.model
    //                     }
    //                 );
    //                 preds.down('#header').destroy();
    //                 var succs = this.down('#rightCol').add(
    //                     {
    //                         xtype: 'rallypopoverchilditemslistview',
    //                         target: array[index],
    //                         record: this.record,
    //                         childField: 'Successors',
    //                         addNewConfig: null,
    //                         gridConfig: {
    //                             title: '<b>Successors:</b>',
    //                             enableEditing: false,
    //                             enableRanking: false,
    //                             enableBulkEdit: false,
    //                             showRowActionsColumn: false,
    //                             columnCfgs : [
    //                             'FormattedID',
    //                             'Name',
    //                             {
    //                                 text: '% By Count',
    //                                 dataIndex: 'PercentDoneByStoryCount'
    //                             },
    //                             {
    //                                 text: '% By Est',
    //                                 dataIndex: 'PercentDoneByStoryPlanEstimate'
    //                             },
    //                             'State',
    //                             'c_RAGSatus',
    //                             'ScheduleState'
    //                             ]
    //                         },
    //                         model: this.model
    //                     }
    //                 );
    //                 succs.down('#header').destroy();
    //             }
    //         },

    //         //This is specific to customer. Features are used as RAIDs as well.
    //         nonRAIDStoreConfig: function() {
    //             if (this.record.hasField('c_RAIDType') ){
    //                 switch (this.record.self.ordinal) {
    //                     case 1:
    //                         return  {
    //                             filters: {
    //                                 property: 'c_RAIDType',
    //                                 operator: '=',
    //                                 value: ''
    //                             }
    //                         };
    //                     default:
    //                         return {};
    //                 }
    //             }
    //             else return {};
    //         },

    //         //This is specific to customer. Features are used as RAIDs as well.
    //         RAIDStoreConfig: function() {
    //             var retval = {};

    //             if (this.record.hasField('c_RAIDType') && this.record.hasField('c_RAGStatus')){
    //                         return {
    //                             filters: [{
    //                                 property: 'c_RAIDType',
    //                                 operator: '!=',
    //                                 value: ''
    //                             },
    //                             {
    //                                 property: 'c_RAGStatus',
    //                                 operator: '=',
    //                                 value: 'RED'
    //                             }]
    //                         };
    //                 }
    //                 else return {};
    //             }
    //         });
    // },

    _dataCheckForItem: function(d){
        return "";
    },

    _createNodes: function(data) {
        //These need to be sorted into a hierarchy based on what we have. We are going to add 'other' nodes later
        var nodes = [];
        //Push them into an array we can reconfigure
        _.each(data, function(record) {
            var localNode = (gApp.getContext().getProjectRef() === record.get('Project')._ref);
            nodes.push({'Name': record.get('FormattedID'), 'record': record, 'local': localNode, 'dependencies': []});
        });
        return nodes;
    },

    _findParentType: function(record) {
        //The only source of truth for the hierachy of types is the typeStore using 'Ordinal'
        var ord = null;
        for ( var i = 0;  i < gApp._typeStore.totalCount; i++ )
        {
            if (record.data._type === gApp._typeStore.data.items[i].get('TypePath').toLowerCase()) {
                ord = gApp._typeStore.data.items[i].get('Ordinal');
                break;
            }
        }
        ord += 1;   //We want the next one up, if beyond the list, set type to root
        //If we fail this, then this code is wrong!
        if ( i >= gApp._typeStore.totalCount) {
            return null;
        }
        var typeRecord =  _.find(  gApp._typeStore.data.items, function(type) { return type.get('Ordinal') === ord;});
        return (typeRecord && typeRecord.get('TypePath').toLowerCase());
    },
    _findNodeById: function(nodes, id) {
        return _.find(nodes, function(node) {
            return node.record.data._ref === id;
        });
    },
        //Routines to manipulate the types

    _getSelectedOrdinal: function() {
        return gApp.down('#piType').lastSelection[0].get('Ordinal');
    },

     _getTypeList: function(highestOrdinal) {
        var piModels = [];
        _.each(gApp._typeStore.data.items, function(type) {
            //Only push types below that selected
            if (type.data.Ordinal <= (highestOrdinal ? highestOrdinal: 0) )
                piModels.push({ 'type': type.data.TypePath.toLowerCase(), 'Name': type.data.Name, 'ref': type.data._ref});
        });
        return piModels;
    },

    _highestOrdinal: function() {
        return _.max(gApp._typeStore.data.items, function(type) { return type.get('Ordinal'); }).get('Ordinal');
    },
    _getModelFromOrd: function(number){
        var model = null;
        _.each(gApp._typeStore.data.items, function(type) { if (number == type.get('Ordinal')) { model = type; } });
        return model && model.get('TypePath');
    },

    _getOrdFromModel: function(modelName){
        var model = null;
        _.each(gApp._typeStore.data.items, function(type) {
            if (modelName == type.get('TypePath').toLowerCase()) {
                model = type.get('Ordinal');
            }
        });
        return model;
    },

    _findParentNode: function(nodes, child){
        var record = child.record;
        if (record.data._ref === 'root') return null;

        //Nicely inconsistent in that the 'field' representing a parent of a user story has the name the same as the type
        // of the first level of the type hierarchy.
        var parentField = gApp._getModelFromOrd(0).split("/").pop();
        var parent = record.hasField('WorkProduct')? record.data.WorkProduct : record.hasField('Tasks')?record.data[parentField]:record.data.Parent;
        var pParent = null;
        if (parent ){
            //Check if parent already in the node list. If so, make this one a child of that one
            //Will return a parent, or null if not found
            pParent = gApp._findNodeById(nodes, parent._ref);
        }
        else {
            //Here, there is no parent set, so attach to the 'null' parent.
            var pt = gApp._findParentType(record);
            //If we are at the top, we will allow d3 to make a root node by returning null
            //If we have a parent type, we will try to return the null parent for this type.
            if (pt) {
                var parentName = '/' + pt + '/null';
                pParent = gApp._findNodeById(nodes, parentName);
            }
        }
        //If the record is a type at the top level, then we must return something to indicate 'root'
        return pParent?pParent: gApp._findNodeById(nodes, 'root');
    },

    _createTree: function (nodes) {
        //Try to use d3.stratify to create nodet
        var nodetree = d3.stratify()
                    .id( function(d) {
                        var retval = (d.record && d.record.data._ref) || null; //No record is an error in the code, try to barf somewhere if that is the case
                        return retval;
                    })
                    .parentId( function(d) {
                        var pParent = gApp._findParentNode(nodes, d);
                        return (pParent && pParent.record && pParent.record.data._ref); })
                    (nodes);
        return nodetree;
    },

    initComponent: function() {
        this.callParent(arguments);
        this.addEvents('redrawTree');
    }
});
}());
