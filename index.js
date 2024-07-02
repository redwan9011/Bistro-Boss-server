const express = require('express');
const app = express();
const port = process.env.PORT || 5000;
require('dotenv').config()
var jwt = require('jsonwebtoken');
const cors = require('cors');
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY)
// middleware

app.use(cors())
app.use(express.json())




const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dpklxw3.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const menusCollection = client.db("bistroDB").collection("menus")
        const reviewsCollection = client.db("bistroDB").collection("reviews")
        const cartCollection = client.db("bistroDB").collection("carts")
        const usersCollection = client.db("bistroDB").collection("users")
        const paymentCollection = client.db("bistroDB").collection("payment")

        // JWT related api
        app.post('/jwt', async(req, res)=> {
            const user = req.body;
            const token = jwt.sign(user, process.env.TOKEN_SECRET, { expiresIn:'2h'})
            res.send( {token})
        })

        // midlleware
        const verifyToken = (req, res, next) => {
            console.log('inside verify token',req.headers.authorization);
            if(!req.headers.authorization){
                return res.status(401).send({message: 'unAuthorized access'})
            }
            const token = req.headers.authorization.split(' ')[1]
           jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded)=> {
                if(err){
                    return res.status(401).send({message: 'unAuthorized access'})
                }
                req.decoded = decoded;
                next()
           })
           
        }
// use verify admin after verify token 
        const verifyAdmin = async(req, res, next)=> {
            const email = req.decoded.email;
            const query = { email: email}
            const user = await usersCollection.findOne(query)
            const isAdmin = user?.role === 'admin'
            if(!isAdmin){
                return res.status(403).send({message: 'forbidden access'})
            }
            next()
        }


        // users related api

        app.get('/users',verifyToken,verifyAdmin, async(req, res) => {
            
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        app.get('/users/admin/:email', verifyToken, async(req, res)=> {
            const email = req.params.email
            if( email !==  req.decoded.email){
              return  res.status(403).send({message: 'forbidden access'})
            }
            const query = {email: email}
            const user =  await usersCollection.findOne(query)
            let admin = false
            if(user){
                admin = user?.role === 'admin'
            }
            res.send(admin)
        })

        app.post('/users' , async(req, res) => {
            const user = req.body;
            // insert email if it doesn't exist
            // you can do this in many ways ( 1. email, 2. upser, 3. simple cheacking)

            const query = {email: user.email}
            const existingUser = await usersCollection.findOne(query);
            if(existingUser) {
                return res.send( {message: 'users already exixt', insertedId:null})
            }

            const result = await usersCollection.insertOne(user);
            res.send(result)
        })
        app.patch('/users/admin/:id',verifyToken, verifyAdmin, async(req, res)=> {
            const id = req.params.id
            const filter = { _id : new ObjectId(id)}
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })

        app.delete('/users/:id',verifyToken, verifyAdmin, async(req, res )=> {
            const id = req.params.id;
            const query = {_id : new ObjectId(id)}
            const result = await usersCollection.deleteOne(query)
            res.send(result)
        })

        // menu related api

        app.get('/menus' , async(req, res) => {
            const result = await menusCollection.find().toArray()
            res.send(result)
        })

        app.get('/menus/:id', async(req,res) => {
            const id = req.params.id
            const query ={ _id : id}
            const result = await menusCollection.findOne(query)
            res.send(result)
        })

        app.post('/menus',verifyToken, verifyAdmin, async(req, res)=> {
            const menus = req.body;
            const result = await menusCollection.insertOne(menus);
            res.send(result)
        })

        app.patch('/menus/:id' , async(req,res)=> {
            const item = req.body;
            const id =req.params.id;
            const filter = { _id: id}
            const updatedDoc = {
                $set: {
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    image: item.image,
                    recipe: item.recipe,
                }
            }
            const result = await menusCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })

        app.delete('/menus/:id', verifyToken, verifyAdmin, async(req, res)=> {
            const id = req.params.id;
            const query = { _id :   id }
            const result = await menusCollection.deleteOne(query);
            res.send(result)
        })
// revews relaed api
        app.get('/reviews' , async(req, res) => {
            const result = await reviewsCollection.find().toArray()
            res.send(result)
        })

        // carts Collection;
        app.get('/carts' , async(req, res)=> {
            const email = req.query.email
            const query = {email: email}
            const result = await cartCollection.find(query).toArray()
            res.send(result)
        })

        app.post('/carts' , async(req, res) => {
            const cart = req.body;
            const result = await cartCollection.insertOne(cart)
            res.send(result)
        })

        app.delete('/carts/:id' , async(req, res) => {
            const id = req.params.id;
            const query = { _id : new ObjectId(id)}
            const result = await cartCollection.deleteOne(query);
            res.send(result)
        })

        // payment intent 
        app.post('/create-payment-intent', async(req, res)=> {
            const {price} = req.body;
            const amount = parseInt(price * 100);
            console.log('inside the amount' , amount);
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                payment_method_types: [
                  "card"
                ],
            })

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // payment api
        app.get('/payment/:email', verifyToken, async(req, res)=> {
            const query = {email: req.params.email }
            if(req.params.email !== req.decoded.email){
                return res.status(403).send({message: 'forbidden acess'})
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result)
        })
     

        app.post('/payment', async(req, res)=> {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment)
            // carefully delete each item from the cart
            console.log('payment info', payment); 
            const query = { _id : {
                $in: payment.cartId.map(id => new ObjectId(id))
            }}
            const deleteResult = await cartCollection.deleteMany(query)
            res.send({result, deleteResult})
        })

        // stats or analytics

        app.get('/admin-stats',verifyToken,  verifyAdmin, async(req, res)=> {
            const users = await usersCollection.estimatedDocumentCount()
            const menuItems = await menusCollection.estimatedDocumentCount()
            const orders = await paymentCollection.estimatedDocumentCount()

            // this is not the best way to get reveneu.
            // const payments = await paymentCollection.find().toArray()
            // const revenue = payments.reduce( (total, payment)=> total + payment.
            // payment, 0)

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue :{ $sum : '$payment'}
                    }
                }
            ]).toArray()

            const revenue = result.length > 0 ? result[0].totalRevenue : 0 

            res.send({
                users,
                menuItems,
                orders,
                revenue
            })
        })


        // order status
        // -----------NON EFFICIENT WAY----------


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir)


app.get('/', (req, res) => {
    res.send('Bistro boss runing ')
})

app.listen(port, () => {
    console.log('bistro boss running on', port);
})