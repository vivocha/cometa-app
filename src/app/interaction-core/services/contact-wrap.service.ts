import {Injectable, NgZone} from '@angular/core';
import * as fromStore from '../store';
import {Store} from '@ngrx/store';
import {ClientContactCreationOptions} from '@vivocha/global-entities/dist/contact';
import {VvcDataCollectionService} from './data-collection.service';
import {VvcProtocolService} from './protocol.service';
import {InteractionContext} from '@vivocha/client-visitor-core/dist/widget';
import {VvcMessageService} from './messages.service';
import {objectToDataCollection} from '@vivocha/global-entities/dist/wrappers/data_collection';
import {VvcUiService} from './ui.service';
import {DataCollectionState} from '../store/models.interface';

@Injectable()
export class VvcContactWrap {

  private vivocha;
  private contact;
  private context;

  lastSystemMessageId;
  agent;
  isClosed = false;
  isWritingTimer;
  isWritingTimeout = 30000;
  incomingCallback;
  incomingOffer;
  incomingMedia;

  constructor(
    private store: Store<fromStore.AppState>,
    private dcService: VvcDataCollectionService,
    private protocolService: VvcProtocolService,
    private messageService: VvcMessageService,
    private uiService: VvcUiService,
    private zone: NgZone
  ){}

  acceptOffer(){
    this.mergeOffer(this.incomingOffer, this.incomingCallback);
    this.uiService.setVoiceAccepted();
  }
  askForUpgrade(media){
    this.contact.getMediaOffer().then(offer => {
      offer[media] = {
        tx: 'required',
        rx: 'required',
        via: 'net'
      };
      if (media === 'Video'){
        offer['Voice'] = {
          tx: 'required',
          rx: 'required',
          via: 'net'
        };
      }
      if (media === 'Voice' || media === 'Video') offer[media].engine = 'WebRTC';
      this.uiService.setIsOffering(media);
      this.contact.offerMedia(offer).then(() => {
        this.zone.run( () => {

        });
      }, (err) => {
        this.zone.run( () => {
          this.uiService.setOfferRejected();
        })
      })
    })

  }
  attachDataAndCreateContact(context){
    const contactOptions: { data: any[], nick?: string} = { data: [] };
    const dataCollection = context.dataCollections[0];
    const data = {};
    for (let i = 0; i < dataCollection.fields.length; i++) {
      const field = dataCollection.fields[i];
      if (field.format === 'nickname' && field.id) {
        contactOptions.nick = data[field.id];
      }
      const hasDefault = typeof field.defaultConstant !== 'undefined';

      field.value = hasDefault ? field.defaultConstant.toString() : field.defaultConstant;

      data[field.id] = field.value;
    }
    contactOptions.data.push(objectToDataCollection(data, dataCollection.id, dataCollection))
    this.createContact(contactOptions);
  }
  checkForTranscript() {
    const transcript = this.contact.contact.transcript;
    for (const m in transcript) {
      const msg = transcript[m];
      switch (msg.type) {
        case 'text':
          this.messageService.addChatMessage(msg, this.agent);
          break;
        case 'attachment':
          this.store.dispatch(new fromStore.NewMessage({
            text: msg.meta.desc || msg.meta.originalName,
            type: 'chat',
            isAgent: msg.agent,
            meta: msg.meta,
            url: (msg.meta.originalUrl) ? msg.meta.originalUrl : msg.url,
            from_nick: msg.from_nick,
            from_id: msg.from_id
          }));
          break;
      }
    }
  }
  closeContact(){
    if (this.contact) {
      this.contact.leave();
      this.uiService.setClosedByVisitor();
      this.messageService.sendSystemMessage('STRINGS.MESSAGES.LOCAL_CLOSE');
      this.isClosed = true;

    }
  }
  closeUploadPanel(){
    this.uiService.setUploadPanel(false);
  }
  createContact(dataToMerge?){
    //this.setQueueState();
    const conf = this.getContactOptions(dataToMerge);
    this.vivocha.createContact(conf).then( (contact) => {
      this.zone.run( () => {
        this.contact = contact;
        this.mapContact();
      });
    }, (err) => {
      console.log('Failed to create contact', err);
      this.vivocha.pageRequest('interactionFailed', err.message);
    });
  }
  dispatch(action){
    //this.zone.run( () => {
      this.store.dispatch(action);
    //});
  }
  getContactOptions(dataToMerge?):ClientContactCreationOptions {
    const initialOpts =  {
      campaignId: this.context.campaign.id,
      version: this.context.campaign.version,
      channelId: 'web',
      entryPointId: this.context.entryPointId,
      engagementId: this.context.engagementId,
      initialOffer: this.protocolService.getInitialOffer(this.context.requestedMedia),
      lang: this.context.language,
      vvcu: this.context.page.vvcu,
      vvct: this.context.page.vvct,
      first_uri: this.context.page.first_uri,
      first_title: this.context.page.first_title
    };
    if (dataToMerge){
      return Object.assign({}, initialOpts, dataToMerge);
    }
    else return Object.assign({}, initialOpts);
  }
  /*
  hasDataCollection() {
    return this.dcService.hasDataCollection(this.context);
  }*/
  hangUp(){
    this.contact.getMediaOffer().then(mediaOffer => {
      if (mediaOffer['Voice']) {
        mediaOffer['Voice'].tx = 'off';
        mediaOffer['Voice'].rx = 'off';
      }
      if (mediaOffer['Video']) {
        mediaOffer['Video'].tx = 'off';
        mediaOffer['Video'].rx = 'off';
      }
      this.contact.offerMedia(mediaOffer);
    });
  }
  hasRecallForNoAgent(){
    return false;
  }
  hideChat(){
    this.uiService.hideChat();
  }
  initializeContact(vivocha, context){
    this.vivocha = vivocha;
    this.context = context;
    this.uiService.initializeUi(this.context);
    if (this.isInPersistence()) this.resumeContact(context);
    else {
      this.dcService.onDataCollectionCompleted(context).subscribe( (data: DataCollectionState) => {
        if (data.completed) {
          this.createContact(data.creationOptions);
        }
      });
      if (this.dcService.hasSurvey()){
        this.dcService.onSurveyCompleted().subscribe( (survey) => {
          if (survey.completed){
            this.contact.storeSurvey(survey.surveyToSend);
          }
        });
      }
      this.dcService.processDataCollections();
      /*
      if (this.isRecallContact()){
        this.dcService.showRecall();
      } else {
        if (this.isChatEmulationContact()) {
          if (this.hasDataCollection() && this.hasRecallForNoAgent() && this.noAgents()) {
            this.dcService.showDcWithRecall();
          }
        } else {
          if (this.hasDataCollection()) {
            if (this.dcService.dcAlreadyFilled()) {
              this.attachDataAndCreateContact(context);
            }
            else console.log("should render dc");
          }
          else this.createContact();
        }
      }
      */
    }
  }
  isChatEmulationContact(){
    return false;
  }
  isRecallContact(){
    return false;
  }
  isInPersistence(){
    return !!this.context.persistenceId
  }
  mapContact(){
    this.vivocha.pageRequest('interactionCreated', this.contact).then( (data) => {
      console.log('interaction created', data);
    }, err => {
      console.log('interaction failed', err);
    });

    this.contact.getLocalCapabilities().then( caps => {
      //this.dispatch(new fromStore.WidgetLocalCaps(caps));
      console.log('LOCALCAPS', caps);
    }, err => {
      console.log('error retrieving localcaps', err);
    });
    this.contact.getRemoteCapabilities().then( caps => {
      //this.dispatch(new fromStore.WidgetRemoteCaps(caps));
      console.log('REMOTECAPS', caps);
    }, err => {
      console.log('error retrieving remotecaps', err);
    });
    this.contact.on('attachment', (url, meta, fromId, fromNick, isAgent) => {
      this.zone.run( () => {
        const attachment = {url, meta, fromId, fromNick, isAgent};
        console.log('ATTACHMENT', attachment);
        meta.url = (meta.originalUrl) ? meta.originalUrl : url;
        const msg = {
          body: meta.desc || meta.originalName,
          type: 'chat',
          isAgent: isAgent,
          meta: meta,
          from_nick: fromNick,
          from_id: fromId
        };
        this.messageService.addChatMessage(msg, this.agent);
      });
    });
    this.contact.on('joined', (c) => {
        if (c.user) {
          this.onAgentJoin(c);
        } else {
          this.onLocalJoin(c);
        }
    });
    this.contact.on('rawmessage', (msg) => {
      this.zone.run( () => {
        if (msg.type != 'text') return;
        if (msg.quick_replies){
          this.messageService.addQuickRepliesMessage(msg);
        }
        else if (msg.template) {
          this.messageService.addTemplateMessage(msg);
        } else {
          console.log('dispatching chat message', this.contact.contact.agentInfo, this.contact);
          this.messageService.addChatMessage(msg, this.agent);
        }
        if (msg.agent) this.uiService.setIsWriting(false);
        this.uiService.newMessageReceived();
        //this.playAudioNotification();
      });

    });
    this.contact.on('iswriting', (from_id, from_nick, agent) => {
      this.zone.run( () => {
        if (agent) {
          this.setIsWriting();
        }
      });
    });
    this.contact.on('localtext', (text) => {
      this.zone.run( () => {
        if (this.agent.is_bot){
          this.setIsWriting();
        }
        this.messageService.addLocalMessage(text);
      });
    });
    this.contact.on('left', obj => {
      this.zone.run( () => {
        console.log('LEFT', obj);
        if (obj.channels && (obj.channels.user !== undefined) && obj.channels.user === 0) {
          this.uiService.setClosedByAgent();
          this.messageService.sendSystemMessage('STRINGS.MESSAGES.REMOTE_CLOSE');
          this.isClosed = true;
        }
      });

    });
    this.contact.on('localcapabilities', caps => {
      console.log('ON_LOCAL',caps);
    });
    this.contact.on('capabilities', caps => {
      console.log('ON_REMOTE',caps);
    });
    this.contact.on('mediachange', (media, changed) => {
      console.log('MEDIACHANGE', media, changed);
      this.zone.run( () => {
        this.protocolService.setMediaChange(media);
        this.uiService.setMediaState(media);
      })
    });
    this.contact.on('mediaoffer', (offer, cb) => {
      console.log('OFFER', offer);
      this.zone.run( () => {
        this.onMediaOffer(offer, cb);
      })
    });
  }
  mergeOffer(diffOffer, cb){
    this.contact.mergeMedia(diffOffer).then(mergedMedia => {
      this.zone.run( () => {
        cb(undefined, mergedMedia);
      })
    });
  }
  muteToggle(muted){
    this.uiService.setMuteInProgress();
    this.contact.getMediaEngine('WebRTC').then( engine => {
      if (muted) {
        engine.muteLocalAudio();
      } else {
        engine.unmuteLocalAudio();
      }
      this.zone.run( () => {
        console.log('setting muted', muted);
        this.uiService.setMuted(muted);
      });
    });
  }
  minimize(minimize){
    if (minimize) {
      this.vivocha.minimize({ bottom: "10px", right: "10px" }, { width: '70px', height: '70px' });
      this.uiService.setMinimizedState()
    } else {
      this.vivocha.maximize();
      this.uiService.setNormalState();
    }
  }
  minimizeMedia(){
    if (!this.protocolService.isAlreadyConnectedWith('Chat')){
      //this.prococolService.sendOffer(this.protocolService.getOfferWithChat());
      this.askForUpgrade('Chat');
    }
    this.uiService.setMinimizedMedia();
  }
  noAgents(){
    return false;
  }
  onAgentJoin(join){
    this.contact.getMedia().then( (media) => {
      this.zone.run( () => {
        console.log('AGENT JOIN', join, media);
        const agent : {
          id: string,
          nick: string,
          is_bot: boolean,
          is_agent: boolean,
          avatar?: string
        } = {
          id: join.user,
          nick: join.nick,
          is_bot: !!join.is_bot,
          is_agent: !join.is_bot,
        };
        if (join.avatar){
          agent.avatar = (join.avatar.base_url) ? join.avatar.base_url + join.avatar.images[0].file : join.avatar
        }
        this.agent = agent;
        this.vivocha.pageRequest('interactionAnswered', agent);
        //this.dispatch(new fromStore.WidgetMediaChange(media));
        this.protocolService.setMediaChange(media);
        this.uiService.setMediaState(media);
        this.setAnsweredState(agent)
      });
    });
  }
  onLocalJoin(join){
    if (join.reason && join.reason === 'resume') {
      this.contact.getMedia().then((media) => {
        this.zone.run( () => {
          const agentInfo = this.contact.contact.agentInfo;
          const agent : {
            id: string,
            nick: string,
            is_bot: boolean,
            is_agent: boolean,
            avatar?: string
          } = {
            id: agentInfo.id,
            nick: agentInfo.nick,
            is_bot: !!agentInfo.bot,
            is_agent: !agentInfo.bot,
          };
          if (join.avatar){
            agent.avatar = (join.avatar.base_url) ? join.avatar.base_url + join.avatar.images[0].file : join.avatar
          }
          console.log('LOCAL JOIN', agent, this.contact);
          this.agent = agent;
          this.uiService.setAgent(agent);
          this.protocolService.setMediaChange(media);
          this.uiService.setMediaState(media);
          this.checkForTranscript();
        });
      });
    }
  }
  onMediaOffer(offer, cb){
    const o = this.protocolService.confirmNeeded(offer);
    if (o.askForConfirmation){
      this.incomingMedia = o.media;
      this.uiService.setIncomingMedia(o.media);
      this.incomingCallback = cb;
      this.incomingOffer = o.offer;
    }
    else {
      const newOffer = this.protocolService.mergeOffer(offer);
      this.mergeOffer(newOffer, cb);
    }
  }
  openAttachment(url){
    const msg = { type: 'web_url', url: url };
    this.vivocha.pageRequest('interactionEvent', msg.type, msg);
  }
  processQuickReply(reply){
    this.messageService.updateQuickReply(reply.msgId);
    this.contact.sendText(reply.action.title)
  }
  rejectOffer(){
    this.incomingCallback('error', {});
    this.messageService.sendSystemMessage('STRINGS.CALL_REJECTED');
    this.uiService.setOfferRejected();
  }
  resumeContact(context: InteractionContext){
    this.vivocha.dataRequest('getData', 'persistence.contact').then((contactData) => {
      this.vivocha.resumeContact(contactData).then((contact) => {
        this.zone.run( () => {
          this.contact = contact;
          this.mapContact();
        });
      }, (err) => {
        console.log('Failed to resume contact', err);
        this.vivocha.pageRequest('interactionFailed', err.message);
      });
    });

    /*
    this.callStartedWith = context.requestedMedia.toUpperCase();
    this.vivocha.dataRequest('getData', 'persistence.contact').then((contactData) => {
      this.dispatch({type: 'INITIAL_OFFER', payload: {
          offer: contactData.initial_offer,
          context: context
        }});
      this.vivocha.resumeContact(contactData).then((contact) => {
        this.vivocha.pageRequest('interactionCreated', contact);
        console.log('contact created, looking for the caps', contact);
        contact.getLocalCapabilities().then( caps => {
          this.dispatch({type: 'LOCAL_CAPS', payload: caps });
        });
        contact.getRemoteCapabilities().then( caps => {
          this.dispatch({type: 'REMOTE_CAPS', payload: caps });
        });
        this.contact = contact;
        this.mapContact();
      }, (err) => {
        console.log('Failed to resume contact', err);
        this.vivocha.pageRequest('interactionFailed', err.message);
      });
    });
    */
  }
  sendAttachment(upload) {
    this.uiService.setUploading();
    this.contact.attach(upload.file, upload.text).then(() => {
      this.zone.run( () => {
        this.uiService.setUploaded();
      })
    })
  }
  sendPostBack(msg){
    const vvcPostBack = {
      code: "message",
      type: "postback",
      body: msg.title
    };
    if (msg.type === "postback") {
      this.contact.send(vvcPostBack);
    }
    else {
      this.vivocha.pageRequest('interactionEvent', msg.type, msg);
    }
  }
  sendText(text){
    this.contact.sendText(text);
  }
  setAnsweredState(agent){
    this.uiService.setAgent(agent);
    this.messageService.removeMessage(this.lastSystemMessageId);
    if (this.context.variables.showWelcomeMessage){
      this.lastSystemMessageId = this.messageService.sendSystemMessage('STRINGS.CHAT.WELCOME_MESSAGE', { nickname: agent.nick });
    }
  }
  setIsWriting(){
    clearTimeout(this.isWritingTimer);
    this.uiService.setIsWriting(true);
    this.isWritingTimer = setTimeout( () => {
      this.uiService.setIsWriting(false);
    }, this.isWritingTimeout);
  }
  setQueueState(){
    this.lastSystemMessageId = this.messageService.sendSystemMessage('STRINGS.QUEUE.CONNECTING');
  }
  setFullScreen(){
    this.uiService.setFullScreen();
    this.vivocha.setFullScreen();
  }
  showCloseModal(show: boolean){
    this.uiService.setCloseModal(show);
  }
  showUploadPanel(){
    this.uiService.setUploadPanel(true);
  }
  showSurvey(){
    this.dcService.showSurvey();
  }
  submitDataCollection(dc){
    this.dcService.submitDataCollection(dc);
  }
  submitSurvey(survey){
    this.dcService.submitSurvey(survey)
  }
  toggleEmojiPanel(){
    this.uiService.toggleEmojiPanel();
  }
  toggleVideo(show){
    const mode = show ? 'required' : 'off';
    this.contact.getMediaOffer().then(mediaOffer => {
      if (mediaOffer['Video']) {
        mediaOffer['Video'].tx = mode;
      }
      this.zone.run( () => {
        this.uiService.setInTransit(true);
      });
      this.contact.offerMedia(mediaOffer).then( () => {
        this.zone.run( () => {
          this.uiService.setInTransit(false);
        });
      });
    });
  }
}