# Rebuilds src/modules/torch-talk/items.json from the compact source below (same data as project doc torch-talk-items.json v1.0).
import json
N=None
def it(id,tier,rec,kc,note,slots,br,fi,order=(),sh=N,ctx=N,gap=N,mix=N):
    form,slot=(id[0],int(id[2:])) if id[0]!='P' else (N,N)
    S=[{"id":s.split(':')[0],"accept":s.split(':')[1].split('|')} for s in slots.split()]
    ans=gap[2] if gap else N
    acc=[]
    for s in S:
        for a in s["accept"]:
            if a!=ans and a not in acc: acc.append(a)
    ideal=[]
    for s in S:
        if s["accept"][0] not in ideal: ideal.append(s["accept"][0])
    return {"id":id,"pool":"practice" if id[0]=='P' else "real","form":form,"slot":slot,"tier":tier,"recipient":rec,"knowsContext":kc,
      "note":note,"slots":S,"breakers":br.split(),"fillers":fi.split(),"order":[list(o.split('<')) for o in order],
      "shorthand":{"tile":sh[0],"slots":sh[1].split()} if sh else N,
      "context":{"tile":ctx[0],"type":ctx[1],"slot":ctx[2]} if ctx else N,
      "gap":{"slot":gap[0],"question":gap[1],"answerTile":gap[2],"reply":gap[3]} if gap else N,
      "mixup":{"echo":mix[0],"fixSlot":mix[1]} if mix else N,
      "tiles":acc+br.split()+fi.split(),"ideal":ideal,"cap":min(len(ideal)+4,10)}
T,F=True,False
I=[
it("A-01","E","liam",T,"Hi Liam! The bike ride is on Saturday morning. Don't forget your helmet.","event:bike day:Saturday item:helmet","Sunday evening gloves forget","ride morning hi the on your bring please remember not go"),
it("A-02","E","mia",T,"Mia, the bake sale starts at 10am at school. Please bring the cupcakes you made.","event:sale time:10am place:school item:cupcakes","11am cookies hall","bake bring please starts the at you made not our hi"),
it("A-03","M","liam",T,"Liam, football is back on Saturday! We meet at the usual time and place (the park at 4pm). Bring your own water bottle.","event:football day:Saturday place:usual|park time:usual|4pm item:water|bottle","Sunday 5pm field","bring own meet back the we not time",sh=("usual","place time")),
it("A-04","M","zoey",F,"Zoey, welcome! We're meeting at the Castle (that's our name for the big sandpit) on Wednesday. Bring a snack to share.","action:meet day:Wednesday place:sandpit item:snack","Thursday lunch park","castle bring share welcome our the big a to not we",ctx=("castle","nickname","place")),
it("A-05","E","liam",T,"Liam, swimming lessons start next Tuesday at the pool. Mum forgot to tell me the time.","event:swimming day:Tuesday place:pool time:2pm","1pm 3pm Thursday","lessons start next the at on go we hi not please",gap=("time","when","2pm","Mum says 2pm.")),
it("A-06","M","mia",T,"Mia, movie night is at my house on Friday at 7pm. Bring a blanket and your pillow.","event:movie day:Friday time:7pm item1:blanket item2:pillow","8pm Saturday popcorn","night bring your a and house at my not the",mix=("8pm","time")),
it("A-07","H","zoey",F,"Zoey, the kite contest is this Sunday at the usual time and place (the park at 4pm). Kites must be homemade, so bring paper and tape. Prizes too!","event:kite day:Sunday place:park time:4pm item1:paper item2:tape","Saturday 5pm glue","usual contest homemade bring prizes and the not at",ctx=("usual","shorthand","place")),
it("A-08","H","zoey",F,"Zoey, the cookie class is not at the hall any more. It's now in the Lab, which is what we call Mia's kitchen. Same day, Thursday at 3pm.","event:cookie place:kitchen owner:Mia's day:Thursday time:3pm","hall Friday 4pm school","lab class now same day the in not moved",ctx=("lab","nickname","place")),
it("A-09","M","mia",T,"Mia, the treasure hunt is on Monday at 11am. Bring a torch. Liam is choosing the place and will tell us soon.","event:treasure|hunt day:Monday time:11am item:torch place:beach","park garden Tuesday","bring a the on soon at we go not",gap=("place","where","beach","Liam says the beach!")),
it("A-10","H","liam",T,"Liam, change of plan for Saturday. First we help Grandpa wash his car at 9am, then we all go to the beach. We're not going to the zoo.","day:Saturday time:9am task:wash object:car place:beach","zoo Sunday 10am park","first then Grandpa help all go not plan change",order=("task<place","object<place")),
it("B-01","E","liam",T,"Liam, the library book swap is on Thursday after school. Bring two old books.","event:swap day:Thursday count:two item:books","Friday three","library book old after school bring the on not please hi we"),
it("B-02","E","mia",T,"Mia, the dance show is tonight at 6pm in the school hall. Wear your tap shoes.","event:dance|show time:6pm place:hall item:shoes","7pm gym trainers","tonight school wear tap your the in at not please"),
it("B-03","M","liam",T,"Liam, chess is at the meetup (the library on Friday), like every week. This week it starts at 5pm, not 4pm.","event:chess place:meetup|library day:meetup|Friday time:5pm","4pm Saturday park","every week starts this the on at like not game",sh=("meetup","place day")),
it("B-04","M","zoey",F,"Zoey, the art club meets in the Shack, our name for Noah's garden shed. It's on Tuesday. Please bring old clothes.","event:art place:shed owner:Noah's day:Tuesday item:clothes","Wednesday paint garage","shack club meets garden old please bring the in not",ctx=("shack","nickname","place")),
it("B-05","E","liam",T,"Liam, the puppet show is on Sunday at 2pm. Mum is still booking the place.","event:puppet day:Sunday time:2pm place:theatre","library school Monday","show the on at still mum go we not please hi",gap=("place","where","theatre","Mum says the theatre.")),
it("B-06","M","mia",T,"Mia, Zoey's birthday party is on Saturday at 1pm in her garden. Bring your swimsuit for the paddling pool.","owner:Zoey's event:party day:Saturday time:1pm item:swimsuit","Sunday 2pm beach","birthday garden her paddling bring your the for not at",mix=("Sunday","day")),
it("B-07","H","zoey",F,"Zoey, come to the meetup (the library on Friday) at 4pm. It's a comic-making day. Please bring pens and your own snack.","place:library day:Friday time:4pm event:comic item1:pens item2:snack","Thursday 3pm paint lunch","meetup come making day bring please own not",ctx=("meetup","shorthand","place")),
it("B-08","H","zoey",F,"Zoey, the water fight has moved from the field to the Lagoon, our name for Liam's paddling pool. It's still Saturday, but now at 3pm.","event1:water event2:fight place:pool owner:Liam's day:Saturday time:3pm","field 2pm Sunday beach","lagoon paddling moved still now the not to",ctx=("lagoon","nickname","place")),
it("B-09","M","mia",T,"Mia, the garden camp-out is on Friday night at my house. It starts at 8pm. Mum will say what to bring.","event:camp day:Friday time:8pm item:tent","pillow torch Saturday","garden night house my starts at the on bring not we",gap=("item","bring","tent","Mum says bring a tent.")),
it("B-10","H","liam",T,"Liam, on Sunday we go to the market at 10am to buy seeds, then we plant them in the school garden. Don't go to the shop, it's closed.","day:Sunday time:10am place1:market item:seeds task:plant place2:garden|school","shop 11am Saturday flowers","buy then go to the not we",order=("place1<task","place1<place2")),
it("C-01","E","liam",T,"Liam, the fun run is on Sunday at 8am. Wear your trainers.","event:run day:Sunday time:8am item:trainers","9am Monday sandals","fun wear your the on at please not hi we go"),
it("C-02","E","mia",T,"Mia, we're washing cars for the school trip on Saturday. Meet at the school gate and bring a sponge.","task:wash day:Saturday place:school|gate item:sponge","Sunday bucket hall","cars trip meet bring the a for and not at"),
it("C-03","M","liam",T,"Liam, spy club is at HQ, same as always (the treehouse at 10am). This time it's on Tuesday. Bring your secret notebook.","event:spy place:HQ|treehouse time:HQ|10am day:Tuesday item:notebook","Wednesday 11am pencil","club same always secret bring your the on not",sh=("HQ","place time")),
it("C-04","M","zoey",F,"Zoey, after football on Thursday we all go to Nana's. That's what we call the bakery on the corner. Bring some money for a bun.","day:Thursday after:football place:bakery item:money","Friday café lunch","Nana's after corner bun bring all go the some not we",ctx=("Nana's","nickname","place")),
it("C-05","E","liam",T,"Liam, the class zoo trip is on Wednesday. We leave at 9am. The teacher will tell us what to bring.","place:zoo day:Wednesday time:9am item:lunch","camera money Thursday","trip class we school leave the to on at not bring",gap=("item","bring","lunch","Teacher says a packed lunch.")),
it("C-06","M","mia",T,"Mia, talent show practice is on Monday at 4pm in the library, not the gym. Bring your guitar.","event:practice day:Monday time:4pm place:library item:guitar","gym 5pm Tuesday","talent show bring your the in on at not please",mix=("gym","place")),
it("C-07","H","zoey",F,"Zoey, bird watching is at HQ, same as always (the treehouse at 10am). It's this Saturday. Bring a hat and a snack, but no phones.","event:bird place:treehouse time:10am day:Saturday item1:hat item2:snack","phones Sunday 11am garden","HQ watching same always bring the and not",ctx=("HQ","shorthand","place")),
it("C-08","H","zoey",F,"Zoey, fruit picking is no longer on Sunday. We're going on Friday instead, still at 9am, to the Jungle. That's our name for Gran's orchard.","event:fruit|picking day:Friday time:9am place:orchard owner:Gran's","Sunday 10am farm","jungle instead still going we the to on not",ctx=("jungle","nickname","place")),
it("C-09","M","mia",T,"Mia, recycling day is on Thursday at the town square. Bring your empty bottles. Liam is checking the time.","event:recycling day:Thursday place:square item:bottles time:10am","9am 11am Friday cans","town empty bring your the at on day not",gap=("time","when","10am","Liam says 10am.")),
it("C-10","H","liam",T,"Liam, on Friday we pick up the new tent from Zoey's house at 5pm, then take it to the campsite. We are not using the old tent.","day:Friday time:5pm new:new item:tent place1:Zoey's place2:campsite","old 6pm Saturday beach","pick house then take the to we not",order=("place1<place2",)),
it("P-01","E","liam",T,"Liam, the ice-cream van comes at 3pm today. Bring some coins.","event:ice-cream time:3pm item:coins","4pm card","van comes today some bring the on at please not hi we go"),
it("P-02","E","mia",T,"Mia, art class is on Monday at 5pm. Bring an apron.","event:art day:Monday time:5pm item:apron","Tuesday 6pm","class an bring the on at please not hi we go our"),
it("P-03","E","zoey",F,"Zoey, the swim race is on Friday at the pool. Bring goggles.","event:swim day:Friday place:pool item:goggles","Saturday beach","race bring the on at please not hi we go our all"),
it("P-04","E","liam",T,"Liam, the picnic is on Sunday at the beach. Bring a frisbee.","event:picnic day:Sunday place:beach item:frisbee","Saturday park","bring the on at please not hi we go our all a"),
it("P-05","E","mia",T,"Mia, the magic show is at 2pm in the hall. Bring your cape.","event:magic time:2pm place:hall item:cape","3pm hat","show in bring the on at please not hi we go our"),
it("P-06","E","zoey",F,"Zoey, gardening club is on Tuesday after school. Bring gloves.","event:gardening day:Tuesday item:gloves","Wednesday spade","club after school bring the on at please not hi we go our"),
it("P-07","E","liam",T,"Liam, tennis is on Saturday at 11am. Wear your cap.","event:tennis day:Saturday time:11am item:cap","12pm Sunday","wear bring the on at please not hi we go our all"),
it("P-08","E","mia",T,"Mia, the scooter race is at 10am on the field. Bring your helmet.","event:scooter time:10am place:field item:helmet","11am bike","race bring the on at please not hi we go our all"),
]
D={"version":"1.0","date":"2026-09-26","questions":{"when":"When?","where":"Where?","bring":"Bring what?"},"items":I}
import sys; out=sys.argv[1] if len(sys.argv)>1 else "src/modules/torch-talk/items.json"
json.dump(D,open(out,"w"),ensure_ascii=False,indent=1); print("wrote",out,len(I))
